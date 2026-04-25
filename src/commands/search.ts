import { formatSearchResultsHuman } from '../core/output/human.js';
import { formatSearchResultsJson } from '../core/output/json.js';
import { searchClaudeSessions } from '../runtimes/claude/search.js';
import { isClaudeFixtureMode, resolveClaudeFixturesRoot, resolveClaudeProjectsRoot } from '../runtimes/claude/detect.js';
import { searchCodexSessions } from '../runtimes/codex/search.js';
import { resolveCodexFixturesRoot } from '../runtimes/codex/detect.js';
import { searchOpenCodeSessions } from '../runtimes/opencode/search.js';
import { resolveOpenCodeLiveDb } from '../runtimes/opencode/detect.js';
import type { SearchResultTree } from '../core/types.js';
import type { AgentscopeWarning } from '../core/warnings.js';
import { detectAllRuntimes } from '../core/runtime/detect.js';
import { allTargetRuntimesUnavailable, isSupportedRuntime, runtimeFailureInjected, runtimeUnavailableWarning } from '../core/runtime/availability.js';

export interface SearchCommandOptions {
  query?: string;
  rawArgs?: string[];
  json?: boolean;
  regex?: boolean;
  agent?: string;
  repo?: string;
  path?: string;
  here?: string | boolean;
  since?: string;
  until?: string;
  limit?: number;
  all?: boolean;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function commandError(message: string, exitCode = 1): CommandResult {
  return {
    exitCode,
    stdout: '',
    stderr: message,
  };
}

function jsonError(code: string, message: string): CommandResult {
  return {
    exitCode: 1,
    stdout: JSON.stringify(
      {
        error: {
          code,
          message,
        },
      },
      null,
      2,
    ),
    stderr: '',
  };
}

async function liveReaderUnavailable(command: 'search', json = false): Promise<CommandResult> {
  const reports = await detectAllRuntimes();
  const detected = reports.filter((report) => report.detected).map((report) => report.runtime);
  const suffix = detected.length > 0 ? ` for detected runtimes: ${detected.join(', ')}` : ' for any detected runtime';
  const message = `Live ${command} is enabled, but live session readers are not implemented yet${suffix}. Set AGENTSCOPE_FIXTURES_MODE=1 to use synthetic fixtures for development.`;

  return json ? jsonError('live_reader_unimplemented', message) : commandError(message);
}

export async function runSearchCommand(options: SearchCommandOptions): Promise<CommandResult> {
  const rawArgs = options.rawArgs ?? [];
  if (!options.query || rawArgs.length !== 1) {
    return commandError('Expected exactly one query');
  }

  if (options.agent && options.agent !== 'claude' && options.agent !== 'codex' && options.agent !== 'opencode') {
    return options.json
      ? jsonError('runtime_unavailable', `Unsupported agent in current build: ${options.agent}`)
      : commandError(`Unsupported agent in current build: ${options.agent}`);
  }

  const env = options.env ?? process.env;
  try {
    const targetRuntimes = options.agent ? [options.agent] : ['claude', 'codex', 'opencode'];
    const warnings: AgentscopeWarning[] = [];
    const combinedResults: SearchResultTree[] = [];
    const fixtureMode = isClaudeFixtureMode(env);

    for (const runtime of targetRuntimes) {
      if (!isSupportedRuntime(runtime)) {
        return options.json
          ? jsonError('runtime_unavailable', `Unsupported agent in current build: ${runtime}`)
          : commandError(`Unsupported agent in current build: ${runtime}`);
      }

      if (runtimeFailureInjected(runtime, env)) {
        warnings.push(runtimeUnavailableWarning(runtime));
        continue;
      }

      try {
        if (runtime === 'claude') {
          const results = await searchClaudeSessions({
            query: options.query,
            ...(fixtureMode ? { fixturesRoot: resolveClaudeFixturesRoot(env) } : { liveProjectsRoot: resolveClaudeProjectsRoot(env) }),
            regex: options.regex,
            repo: options.repo,
            path: options.path,
            here:
              options.here === true
                ? options.cwd ?? process.cwd()
                : typeof options.here === 'string'
                  ? options.here
                  : undefined,
            since: options.since,
            until: options.until,
          });
          combinedResults.push(...results.results);
          warnings.push(...results.warnings);
          continue;
        }

        if (runtime === 'codex') {
          if (!fixtureMode) {
            warnings.push(runtimeUnavailableWarning(runtime));
            continue;
          }

          const codexResults = await searchCodexSessions({
            query: options.query,
            fixturesRoot: resolveCodexFixturesRoot(env),
          });
          combinedResults.push(...codexResults.results);
          continue;
        }

        const opencodeResults = await searchOpenCodeSessions({
          query: options.query,
          ...(fixtureMode ? { fixtureDb: env.AGENTSCOPE_OPENCODE_DB ?? 'fixtures/opencode/opencode.db' } : { liveDb: resolveOpenCodeLiveDb(env) }),
        });
        combinedResults.push(...opencodeResults.results);
        warnings.push(...opencodeResults.warnings);
      } catch (error) {
        if (error instanceof Error && /regular expression|regex/i.test(error.message)) {
          throw error;
        }

        warnings.push(runtimeUnavailableWarning(runtime));
      }
    }

    combinedResults.sort((left, right) => left.runtime.localeCompare(right.runtime));

    if (combinedResults.length === 0) {
      if (allTargetRuntimesUnavailable(warnings, targetRuntimes)) {
        return options.json
          ? jsonError('runtime_unavailable', 'All targeted runtimes failed')
          : commandError('All targeted runtimes failed');
      }

      return options.json ? jsonError('no_matches', 'No matches found') : commandError('No matches found');
    }

    const requestedLimit = options.all ? combinedResults.length : options.limit ?? 20;
    const truncated = !options.all && combinedResults.length > requestedLimit;
    const limitedResults = truncated ? combinedResults.slice(0, requestedLimit) : combinedResults;

    if (truncated) {
      warnings.push({
        code: 'search_results_truncated',
        message: `Search results truncated to ${requestedLimit} root results`,
        severity: 'warning',
      });
    }

    const envelope = {
      query: options.query,
      limit: requestedLimit,
      truncated,
      results: limitedResults,
      warnings,
    };

    return {
      exitCode: 0,
      stdout: options.json
        ? JSON.stringify(formatSearchResultsJson(envelope), null, 2)
        : formatSearchResultsHuman(envelope),
      stderr: '',
    };
  } catch (error) {
    return commandError(error instanceof Error ? error.message : 'search failed');
  }
}

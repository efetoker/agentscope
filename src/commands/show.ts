import { materializeTempBundle } from '../core/bundle/materialize.js';
import { prepareClaudeBundle } from '../runtimes/claude/export.js';
import { isClaudeFixtureMode, resolveClaudeFixturesRoot } from '../runtimes/claude/detect.js';
import { prepareCodexBundle } from '../runtimes/codex/export.js';
import { resolveCodexFixturesRoot } from '../runtimes/codex/detect.js';
import { loadClaudeSessions } from '../runtimes/claude/tree.js';
import { loadCodexSessions } from '../runtimes/codex/tree.js';
import { prepareOpenCodeBundle } from '../runtimes/opencode/export.js';
import { loadOpenCodeSessions } from '../runtimes/opencode/tree.js';
import { detectAllRuntimes } from '../core/runtime/detect.js';
import type { AgentscopeWarning } from '../core/warnings.js';
import { isSupportedRuntime, runtimeFailureInjected, runtimeUnavailableWarning } from '../core/runtime/availability.js';

export interface ShowCommandOptions {
  id?: string;
  rawArgs?: string[];
  json?: boolean;
  agent?: string;
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

interface ResolutionCandidate {
  runtime: 'claude' | 'codex' | 'opencode';
  sessionId: string;
  rootSessionId: string;
  repoPath: string;
  pathHint: string;
  timestamp: string;
}

function jsonError(code: string, message: string, candidates: ResolutionCandidate[] = []): CommandResult {
  return {
    exitCode: 1,
    stdout: JSON.stringify(
      {
        error: {
          code,
          message,
          candidates,
        },
      },
      null,
      2,
    ),
    stderr: '',
  };
}

async function liveReaderUnavailable(command: 'show', json = false): Promise<CommandResult> {
  const reports = await detectAllRuntimes();
  const detected = reports.filter((report) => report.detected).map((report) => report.runtime);
  const suffix = detected.length > 0 ? ` for detected runtimes: ${detected.join(', ')}` : ' for any detected runtime';
  const message = `Live ${command} is enabled, but live session readers are not implemented yet${suffix}. Set AGENTSCOPE_FIXTURES_MODE=1 to use synthetic fixtures for development.`;

  return json ? jsonError('live_reader_unimplemented', message) : commandError(message);
}

async function collectCandidates(
  env: NodeJS.ProcessEnv,
  runtimes: Array<'claude' | 'codex' | 'opencode'>,
  id: string,
): Promise<{ candidates: ResolutionCandidate[]; warnings: AgentscopeWarning[] }> {
  const candidates: ResolutionCandidate[] = [];
  const warnings: AgentscopeWarning[] = [];

  if (runtimes.includes('claude')) {
    if (runtimeFailureInjected('claude', env)) {
      warnings.push(runtimeUnavailableWarning('claude'));
    } else {
      try {
        const sessions = await loadClaudeSessions(resolveClaudeFixturesRoot(env));
        for (const session of sessions) {
          if (session.sessionId.toLowerCase().includes(id.toLowerCase())) {
            candidates.push({
              runtime: 'claude',
              sessionId: session.sessionId,
              rootSessionId: session.rootSessionId,
              repoPath: session.repoPath,
              pathHint: session.pathHint,
              timestamp: session.events[0]?.timestamp ?? '',
            });
          }
        }
      } catch {
        warnings.push(runtimeUnavailableWarning('claude'));
      }
    }
  }

  if (runtimes.includes('codex')) {
    if (runtimeFailureInjected('codex', env)) {
      warnings.push(runtimeUnavailableWarning('codex'));
    } else {
      try {
        const sessions = await loadCodexSessions(resolveCodexFixturesRoot(env));
        for (const session of sessions) {
          if (session.sessionId.toLowerCase().includes(id.toLowerCase())) {
            candidates.push({
              runtime: 'codex',
              sessionId: session.sessionId,
              rootSessionId: session.rootSessionId,
              repoPath: session.repoPath,
              pathHint: session.pathHint,
              timestamp: session.timestamp,
            });
          }
        }
      } catch {
        warnings.push(runtimeUnavailableWarning('codex'));
      }
    }
  }

  if (runtimes.includes('opencode')) {
    if (runtimeFailureInjected('opencode', env)) {
      warnings.push(runtimeUnavailableWarning('opencode'));
    } else {
      try {
        const sessions = loadOpenCodeSessions(env.AGENTSCOPE_OPENCODE_DB ?? 'fixtures/opencode/opencode.db');
        for (const session of sessions) {
          if (session.sessionId.toLowerCase().includes(id.toLowerCase())) {
            candidates.push({
              runtime: 'opencode',
              sessionId: session.sessionId,
              rootSessionId: session.rootSessionId,
              repoPath: session.repoPath,
              pathHint: session.pathHint,
              timestamp: session.createdAt,
            });
          }
        }
      } catch {
        warnings.push(runtimeUnavailableWarning('opencode'));
      }
    }
  }

  return { candidates, warnings };
}

function resolveCandidate(candidates: ResolutionCandidate[], requestedId: string): ResolutionCandidate {
  const exact = candidates.filter((candidate) => candidate.sessionId === requestedId);
  if (exact.length === 1) {
    return exact[0];
  }

  if (exact.length > 1) {
    throw new Error('ambiguous_session_id');
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  if (candidates.length === 0) {
    throw new Error('session_not_found');
  }

  throw new Error('ambiguous_session_id');
}

export async function runShowCommand(options: ShowCommandOptions): Promise<CommandResult> {
  const rawArgs = options.rawArgs ?? [];
  if (!options.id || rawArgs.length !== 1) {
    return commandError('Expected exactly one session id');
  }

  const env = options.env ?? process.env;
  if (!isClaudeFixtureMode(env)) {
    return liveReaderUnavailable('show', options.json);
  }

  if (options.agent && !isSupportedRuntime(options.agent)) {
    return options.json
      ? jsonError('runtime_unavailable', `Unsupported agent in current build: ${options.agent}`)
      : commandError(`Unsupported agent in current build: ${options.agent}`);
  }

  try {
    const runtimes: Array<'claude' | 'codex' | 'opencode'> =
      options.agent === 'codex'
        ? ['codex']
        : options.agent === 'claude'
          ? ['claude']
          : options.agent === 'opencode'
            ? ['opencode']
            : ['claude', 'codex', 'opencode'];
    const { candidates, warnings } = await collectCandidates(env, runtimes, options.id);
    let selected: ResolutionCandidate;
    try {
      selected = resolveCandidate(candidates, options.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'show failed';
      const allRuntimesFailed = warnings.some((warning) => warning.code === 'runtime_unavailable') && warnings.length === runtimes.length;
      if (message === 'session_not_found' && allRuntimesFailed) {
        return options.json
          ? jsonError('runtime_unavailable', 'All targeted runtimes failed')
          : commandError('All targeted runtimes failed');
      }

      if (message === 'ambiguous_session_id') {
        return options.json
          ? jsonError('ambiguous_session_id', 'Session id is ambiguous', candidates)
          : commandError(
              `Ambiguous session id. Use a longer id, --agent <runtime>, or --path <path>.\nCandidates: ${candidates.map((candidate) => `${candidate.runtime}:${candidate.sessionId}`).join(', ')}`,
            );
      }

      if (message === 'session_not_found') {
        return options.json ? jsonError('session_not_found', 'Session not found') : commandError('Session not found');
      }

      throw error;
    }

    const bundleInput =
      selected.runtime === 'claude'
        ? await prepareClaudeBundle({
            sessionId: selected.sessionId,
            fixturesRoot: resolveClaudeFixturesRoot(env),
          })
        : selected.runtime === 'codex'
          ? await prepareCodexBundle({
              sessionId: selected.sessionId,
              fixturesRoot: resolveCodexFixturesRoot(env),
            })
          : await prepareOpenCodeBundle({
              sessionId: selected.sessionId,
              fixtureDb: env.AGENTSCOPE_OPENCODE_DB ?? 'fixtures/opencode/opencode.db',
            });
    const bundle = await materializeTempBundle(bundleInput);

    if (options.json) {
      const resolution = selected.sessionId === options.id ? 'exact' : 'partial';
      return {
        exitCode: 0,
        stdout: JSON.stringify(
          {
            requested_id: options.id,
            resolved_runtime: selected.runtime,
            resolved_root_session_id: bundle.manifest.resolvedRootSessionId,
            resolution,
            session_count: bundle.manifest.includedSessionIds.length,
            bundle_path: bundle.path,
            manifest_path: bundle.manifestPath,
            warnings: [...warnings, ...bundle.manifest.warnings],
          },
          null,
          2,
        ),
        stderr: '',
      };
    }

    return {
      exitCode: 0,
      stdout: [
        `Requested ID: ${options.id}`,
        `Resolved runtime: ${selected.runtime}`,
        `Resolved root session ID: ${bundle.manifest.resolvedRootSessionId}`,
        `Bundle path: ${bundle.path}`,
        `Manifest path: ${bundle.manifestPath}`,
        `Session count: ${bundle.manifest.includedSessionIds.length}`,
      ].join('\n'),
      stderr: '',
    };
  } catch (error) {
    return commandError(error instanceof Error ? error.message : 'show failed');
  }
}

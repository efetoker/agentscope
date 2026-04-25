import { materializeBundleInDirectory } from '../core/bundle/materialize.js';
import { prepareClaudeBundle } from '../runtimes/claude/export.js';
import { isClaudeFixtureMode, resolveClaudeFixturesRoot, resolveClaudeProjectsRoot } from '../runtimes/claude/detect.js';
import { prepareCodexBundle } from '../runtimes/codex/export.js';
import { resolveCodexFixturesRoot } from '../runtimes/codex/detect.js';
import { loadClaudeSessions, loadClaudeSessionsWithWarnings } from '../runtimes/claude/tree.js';
import { loadCodexSessions } from '../runtimes/codex/tree.js';
import { prepareOpenCodeBundle } from '../runtimes/opencode/export.js';
import { resolveOpenCodeLiveDb } from '../runtimes/opencode/detect.js';
import { loadOpenCodeSessions, loadOpenCodeSessionsWithWarnings } from '../runtimes/opencode/tree.js';
import { detectAllRuntimes } from '../core/runtime/detect.js';
import type { AgentscopeWarning } from '../core/warnings.js';
import { allTargetRuntimesUnavailable, isSupportedRuntime, runtimeFailureInjected, runtimeUnavailableWarning } from '../core/runtime/availability.js';

export interface ExportCommandOptions {
  id?: string;
  rawArgs?: string[];
  out?: string;
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

async function liveReaderUnavailable(command: 'export'): Promise<CommandResult> {
  const reports = await detectAllRuntimes();
  const detected = reports.filter((report) => report.detected).map((report) => report.runtime);
  const suffix = detected.length > 0 ? ` for detected runtimes: ${detected.join(', ')}` : ' for any detected runtime';

  return commandError(
    `Live ${command} is enabled, but live session readers are not implemented yet${suffix}. Set AGENTSCOPE_FIXTURES_MODE=1 to use synthetic fixtures for development.`,
  );
}

interface ResolutionCandidate {
  runtime: 'claude' | 'codex' | 'opencode';
  sessionId: string;
}

async function collectCandidates(
  env: NodeJS.ProcessEnv,
  runtimes: Array<'claude' | 'codex' | 'opencode'>,
  id: string,
  fixtureMode = true,
): Promise<{ candidates: ResolutionCandidate[]; warnings: AgentscopeWarning[] }> {
  const candidates: ResolutionCandidate[] = [];
  const warnings: AgentscopeWarning[] = [];

  if (runtimes.includes('claude')) {
    if (runtimeFailureInjected('claude', env)) {
      warnings.push(runtimeUnavailableWarning('claude'));
    } else {
      try {
        const loaded = fixtureMode
          ? { sessions: await loadClaudeSessions(resolveClaudeFixturesRoot(env)), warnings: [] }
          : await loadClaudeSessionsWithWarnings({ liveProjectsRoot: resolveClaudeProjectsRoot(env) });
        warnings.push(...loaded.warnings);
        const sessions = loaded.sessions;
        for (const session of sessions) {
          if (session.sessionId.toLowerCase().includes(id.toLowerCase())) {
            candidates.push({
              runtime: 'claude',
              sessionId: session.sessionId,
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
        const loaded = fixtureMode
          ? { sessions: loadOpenCodeSessions(env.AGENTSCOPE_OPENCODE_DB ?? 'fixtures/opencode/opencode.db'), warnings: [] }
          : loadOpenCodeSessionsWithWarnings({ liveDb: resolveOpenCodeLiveDb(env) });
        warnings.push(...loaded.warnings);
        const sessions = loaded.sessions;
        for (const session of sessions) {
          if (session.sessionId.toLowerCase().includes(id.toLowerCase())) {
            candidates.push({
              runtime: 'opencode',
              sessionId: session.sessionId,
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

  if (exact.length > 1 || candidates.length > 1) {
    throw new Error('Ambiguous session id');
  }

  if (candidates.length === 0) {
    throw new Error('Session not found');
  }

  return candidates[0];
}

export async function runExportCommand(options: ExportCommandOptions): Promise<CommandResult> {
  const rawArgs = options.rawArgs ?? [];
  if (!options.id || rawArgs.length !== 1) {
    return commandError('Expected exactly one session id');
  }

  if (!options.out) {
    return commandError('Missing required --out directory');
  }

  const env = options.env ?? process.env;
  const fixtureMode = isClaudeFixtureMode(env);
  if (options.agent && !isSupportedRuntime(options.agent)) {
    return commandError(`Unsupported agent in current build: ${options.agent}`);
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
    const liveUnsupported = !fixtureMode ? runtimes.filter((runtime) => runtime === 'codex') : [];
    const collectRuntimes = !fixtureMode ? runtimes.filter((runtime) => runtime !== 'codex') : runtimes;
    const { candidates, warnings } = await collectCandidates(env, collectRuntimes, options.id, fixtureMode);
    warnings.push(...liveUnsupported.map((runtime) => runtimeUnavailableWarning(runtime)));
    const allRuntimesFailed = allTargetRuntimesUnavailable(warnings, runtimes);
    if (allRuntimesFailed) {
      return commandError('All targeted runtimes failed');
    }

    const selected = resolveCandidate(candidates, options.id);
    const bundleInput =
      selected.runtime === 'claude'
        ? await prepareClaudeBundle({
            sessionId: selected.sessionId,
            ...(fixtureMode ? { fixturesRoot: resolveClaudeFixturesRoot(env) } : { liveProjectsRoot: resolveClaudeProjectsRoot(env) }),
          })
        : selected.runtime === 'codex'
          ? await prepareCodexBundle({
              sessionId: selected.sessionId,
              fixturesRoot: resolveCodexFixturesRoot(env),
            })
           : await prepareOpenCodeBundle({
               sessionId: selected.sessionId,
               ...(fixtureMode ? { fixtureDb: env.AGENTSCOPE_OPENCODE_DB ?? 'fixtures/opencode/opencode.db' } : { liveDb: resolveOpenCodeLiveDb(env) }),
             });
    const bundle = await materializeBundleInDirectory(bundleInput, options.out);

    return {
      exitCode: 0,
      stdout: [
        `Requested ID: ${options.id}`,
        `Resolved runtime: ${selected.runtime}`,
        `Resolved root session ID: ${bundle.manifest.resolvedRootSessionId}`,
        `Bundle path: ${bundle.path}`,
        `Manifest path: ${bundle.manifestPath}`,
      ].join('\n'),
      stderr: '',
    };
  } catch (error) {
    return commandError(error instanceof Error ? error.message : 'export failed');
  }
}

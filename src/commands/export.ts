import { materializeBundleInDirectory } from '../core/bundle/materialize.js';
import { prepareClaudeBundle } from '../runtimes/claude/export.js';
import { isClaudeFixtureMode, resolveClaudeFixturesRoot } from '../runtimes/claude/detect.js';
import { prepareCodexBundle } from '../runtimes/codex/export.js';
import { resolveCodexFixturesRoot } from '../runtimes/codex/detect.js';
import { loadClaudeSessions } from '../runtimes/claude/tree.js';
import { loadCodexSessions } from '../runtimes/codex/tree.js';
import { prepareOpenCodeBundle } from '../runtimes/opencode/export.js';
import { loadOpenCodeSessions } from '../runtimes/opencode/tree.js';
import { detectAllRuntimes } from '../core/runtime/detect.js';

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
): Promise<ResolutionCandidate[]> {
  const candidates: ResolutionCandidate[] = [];

  if (runtimes.includes('claude')) {
    const sessions = await loadClaudeSessions(resolveClaudeFixturesRoot(env));
    for (const session of sessions) {
      if (session.sessionId.toLowerCase().includes(id.toLowerCase())) {
        candidates.push({
          runtime: 'claude',
          sessionId: session.sessionId,
        });
      }
    }
  }

  if (runtimes.includes('codex')) {
    const sessions = await loadCodexSessions(resolveCodexFixturesRoot(env));
    for (const session of sessions) {
      if (session.sessionId.toLowerCase().includes(id.toLowerCase())) {
        candidates.push({
          runtime: 'codex',
          sessionId: session.sessionId,
        });
      }
    }
  }

  if (runtimes.includes('opencode')) {
    const sessions = loadOpenCodeSessions(env.AGENTSCOPE_OPENCODE_DB ?? 'fixtures/opencode/opencode.db');
    for (const session of sessions) {
      if (session.sessionId.toLowerCase().includes(id.toLowerCase())) {
        candidates.push({
          runtime: 'opencode',
          sessionId: session.sessionId,
        });
      }
    }
  }

  return candidates;
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
  if (!isClaudeFixtureMode(env)) {
    return liveReaderUnavailable('export');
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
    const selected = resolveCandidate(await collectCandidates(env, runtimes, options.id), options.id);
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

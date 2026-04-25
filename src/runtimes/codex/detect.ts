import path from 'node:path';
import os from 'node:os';

export const CODEX_FIXTURES_ROOT_ENV = 'AGENTSCOPE_CODEX_FIXTURES_ROOT';
export const CODEX_HOME_ENV = 'AGENTSCOPE_CODEX_HOME';
export const CODEX_SESSION_INDEX_ENV = 'AGENTSCOPE_CODEX_SESSION_INDEX';
export const CODEX_SESSIONS_ROOT_ENV = 'AGENTSCOPE_CODEX_SESSIONS_ROOT';

export function resolveCodexFixturesRoot(env: NodeJS.ProcessEnv = process.env): string {
  return env[CODEX_FIXTURES_ROOT_ENV] ?? path.join('fixtures', 'codex');
}

export function resolveCodexHome(env: NodeJS.ProcessEnv = process.env): string {
  return env[CODEX_HOME_ENV] ?? path.join(os.homedir(), '.codex');
}

export function resolveCodexSessionIndex(env: NodeJS.ProcessEnv = process.env): string {
  return env[CODEX_SESSION_INDEX_ENV] ?? path.join(resolveCodexHome(env), 'session_index.jsonl');
}

export function resolveCodexSessionsRoot(env: NodeJS.ProcessEnv = process.env): string {
  return env[CODEX_SESSIONS_ROOT_ENV] ?? path.join(resolveCodexHome(env), 'sessions');
}

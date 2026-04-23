import path from 'node:path';

export const CODEX_FIXTURES_ROOT_ENV = 'AGENTSCOPE_CODEX_FIXTURES_ROOT';

export function resolveCodexFixturesRoot(env: NodeJS.ProcessEnv = process.env): string {
  return env[CODEX_FIXTURES_ROOT_ENV] ?? path.join('fixtures', 'codex');
}

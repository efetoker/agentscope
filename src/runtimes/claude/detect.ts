import path from 'node:path';

import { detectClaudeRuntime as detectClaudeFilesystemRuntime } from '../../core/runtime/detect.js';

export const CLAUDE_FIXTURES_MODE_ENV = 'AGENTSCOPE_FIXTURES_MODE';
export const CLAUDE_FIXTURES_ROOT_ENV = 'AGENTSCOPE_FIXTURES_ROOT';

export function isClaudeFixtureMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[CLAUDE_FIXTURES_MODE_ENV] === '1';
}

export function resolveClaudeFixturesRoot(env: NodeJS.ProcessEnv = process.env): string {
  return env[CLAUDE_FIXTURES_ROOT_ENV] ?? path.join('fixtures', 'claude', 'sample-project');
}

export async function detectClaudeRuntime() {
  return detectClaudeFilesystemRuntime();
}

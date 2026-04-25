import os from 'node:os';
import path from 'node:path';

import { detectClaudeRuntime as detectClaudeFilesystemRuntime } from '../../core/runtime/detect.js';

export const CLAUDE_FIXTURES_MODE_ENV = 'AGENTSCOPE_FIXTURES_MODE';
export const CLAUDE_FIXTURES_ROOT_ENV = 'AGENTSCOPE_FIXTURES_ROOT';
export const CLAUDE_ROOT_ENV = 'AGENTSCOPE_CLAUDE_ROOT';
export const CLAUDE_PROJECTS_DIR_ENV = 'AGENTSCOPE_CLAUDE_PROJECTS_DIR';

export function isClaudeFixtureMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[CLAUDE_FIXTURES_MODE_ENV] === '1';
}

export function resolveClaudeFixturesRoot(env: NodeJS.ProcessEnv = process.env): string {
  return env[CLAUDE_FIXTURES_ROOT_ENV] ?? path.join('fixtures', 'claude', 'sample-project');
}

export function resolveClaudeProjectsRoot(env: NodeJS.ProcessEnv = process.env): string {
  if (env[CLAUDE_PROJECTS_DIR_ENV]) {
    return env[CLAUDE_PROJECTS_DIR_ENV];
  }

  if (env[CLAUDE_ROOT_ENV]) {
    return path.join(env[CLAUDE_ROOT_ENV], 'projects');
  }

  return path.join(os.homedir(), '.claude', 'projects');
}

export async function detectClaudeRuntime() {
  return detectClaudeFilesystemRuntime();
}

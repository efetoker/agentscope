import type { SearchResultTree } from '../../core/types.js';

export interface ClaudeRuntimePaths {
  root: string;
  config?: string;
  projectsDir?: string;
}

export interface ClaudeMessageContentPart {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
}

export interface ClaudeSessionEvent {
  sessionId: string;
  rootSessionId: string;
  parentSessionId: string | null;
  timestamp: string;
  repoPath: string;
  cwd: string;
  pathHint: string;
  message: {
    content: ClaudeMessageContentPart[];
  };
}

export interface ClaudeSessionRecord {
  sessionId: string;
  rootSessionId: string;
  parentSessionId: string | null;
  repoPath: string;
  cwd: string;
  pathHint: string;
  sourcePath: string;
  events: ClaudeSessionEvent[];
}

export interface ClaudeSearchInput {
  query: string;
  fixturesRoot: string;
  regex?: boolean;
  repo?: string;
  path?: string;
  here?: string;
  since?: string;
  until?: string;
}

export interface ClaudeSearchResult {
  results: SearchResultTree[];
}

export interface ClaudeTreeInput {
  sessionId: string;
  fixturesRoot: string;
}

export interface ClaudeResolvedTree {
  runtime: 'claude';
  rootSessionId: string;
  sessionIds: string[];
  sessions: ClaudeSessionRecord[];
}

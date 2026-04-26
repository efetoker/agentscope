import type { SearchResultTree } from '../../core/types.js';
import type { AgentscopeWarning } from '../../core/warnings.js';

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
  uuid?: string;
  parentUuid?: string | null;
  timestamp: string;
  repoPath: string;
  cwd: string;
  pathHint: string;
  type?: string;
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
  fixturesRoot?: string;
  liveProjectsRoot?: string;
  regex?: boolean;
  repo?: string;
  path?: string;
  here?: string;
  since?: string;
  until?: string;
}

export interface ClaudeSearchResult {
  results: SearchResultTree[];
  warnings: AgentscopeWarning[];
}

export interface ClaudeTreeInput {
  sessionId: string;
  fixturesRoot?: string;
  liveProjectsRoot?: string;
}

export interface ClaudeResolvedTree {
  runtime: 'claude';
  rootSessionId: string;
  sessionIds: string[];
  sessions: ClaudeSessionRecord[];
  warnings: AgentscopeWarning[];
}

export interface ClaudeLoadInput {
  fixturesRoot?: string;
  liveProjectsRoot?: string;
}

export interface ClaudeLoadResult {
  sessions: ClaudeSessionRecord[];
  warnings: AgentscopeWarning[];
}

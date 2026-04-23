import type { SearchResultTree } from '../../core/types.js';

export interface CodexRuntimePaths {
  codexHome: string;
  sessionIndexJsonl?: string;
  sessionRolloutRoot?: string;
}

export interface CodexSessionIndexEntry {
  session_id: string;
  root_session_id: string;
  parent_session_id: string | null;
  rollout_path: string;
  repo_path: string;
  path_hint: string;
  timestamp: string;
  partial_hint?: string;
}

export interface CodexRolloutEvent {
  session_id: string;
  root_session_id: string;
  parent_session_id: string | null;
  timestamp: string;
  repo_path: string;
  path_hint: string;
  event: {
    type: 'message' | 'tool_result';
    text: string;
  };
}

export interface CodexSessionRecord {
  sessionId: string;
  rootSessionId: string;
  parentSessionId: string | null;
  repoPath: string;
  pathHint: string;
  timestamp: string;
  rolloutPath: string;
  events: CodexRolloutEvent[];
}

export interface CodexSearchInput {
  query: string;
  fixturesRoot: string;
}

export interface CodexSearchResult {
  results: SearchResultTree[];
}

export interface CodexTreeInput {
  sessionId: string;
  fixturesRoot: string;
}

export interface CodexResolvedTree {
  runtime: 'codex';
  rootSessionId: string;
  sessionIds: string[];
  sessions: CodexSessionRecord[];
}

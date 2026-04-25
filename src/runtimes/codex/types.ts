import type { SearchResultTree } from '../../core/types.js';
import type { AgentscopeWarning } from '../../core/warnings.js';

export interface CodexRuntimePaths {
  codexHome: string;
  sessionIndexJsonl?: string;
  sessionRolloutRoot?: string;
}

export interface CodexSessionIndexEntry {
  session_id: string;
  root_session_id?: string;
  parent_session_id?: string | null;
  rollout_path: string;
  repo_path: string;
  path_hint: string;
  timestamp: string;
  partial_hint?: string;
}

export type CodexLinkageConfidence = 'durable' | 'inferred' | 'unknown';

export interface CodexRolloutEvent {
  session_id: string;
  root_session_id: string;
  parent_session_id: string | null;
  timestamp: string;
  repo_path: string;
  path_hint: string;
  rawType?: string;
  tokens?: unknown;
  event: {
    type: 'message' | 'tool_result' | 'session_meta' | 'turn_context' | 'event_msg' | 'response_item' | 'metadata';
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
  sourcePath?: string;
  linkageConfidence?: CodexLinkageConfidence;
  events: CodexRolloutEvent[];
}

export interface CodexLoadInput {
  fixturesRoot?: string;
  liveCodexHome?: string;
  sessionIndexJsonl?: string;
  sessionsRoot?: string;
  historyJsonl?: string;
  archivedSessionsRoot?: string;
}

export interface CodexLoadResult {
  sessions: CodexSessionRecord[];
  warnings: AgentscopeWarning[];
}

export interface CodexSearchInput {
  query: string;
  fixturesRoot?: string;
  liveCodexHome?: string;
  sessionIndexJsonl?: string;
  sessionsRoot?: string;
  historyJsonl?: string;
  archivedSessionsRoot?: string;
}

export interface CodexSearchResult {
  results: SearchResultTree[];
  warnings: AgentscopeWarning[];
}

export interface CodexTreeInput {
  sessionId: string;
  fixturesRoot?: string;
  liveCodexHome?: string;
  sessionIndexJsonl?: string;
  sessionsRoot?: string;
  historyJsonl?: string;
  archivedSessionsRoot?: string;
}

export interface CodexResolvedTree {
  runtime: 'codex';
  rootSessionId: string;
  sessionIds: string[];
  sessions: CodexSessionRecord[];
  warnings?: AgentscopeWarning[];
}

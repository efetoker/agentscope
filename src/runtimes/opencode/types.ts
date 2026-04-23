import type { SearchResultTree } from '../../core/types.js';

export interface OpenCodeRuntimePaths {
  configRoot: string;
  dataRoot: string;
  dbPath?: string;
}

export interface OpenCodeSessionRow {
  id: string;
  root_id: string;
  parent_id: string | null;
  repo_path: string;
  path_hint: string;
  created_at: string;
}

export interface OpenCodeEventRow {
  id: number;
  session_id: string;
  kind: 'message' | 'metadata' | 'error' | 'tool';
  body: string;
}

export interface OpenCodeSessionRecord {
  sessionId: string;
  rootSessionId: string;
  parentSessionId: string | null;
  repoPath: string;
  pathHint: string;
  createdAt: string;
  events: OpenCodeEventRow[];
}

export interface OpenCodeSearchInput {
  query: string;
  fixtureDb: string;
}

export interface OpenCodeSearchResult {
  results: SearchResultTree[];
}

export interface OpenCodeTreeInput {
  sessionId: string;
  fixtureDb: string;
}

export interface OpenCodeResolvedTree {
  runtime: 'opencode';
  rootSessionId: string;
  sessionIds: string[];
  sessions: OpenCodeSessionRecord[];
}

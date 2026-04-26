import type { SearchResultTree } from '../../core/types.js';
import type { AgentscopeWarning } from '../../core/warnings.js';

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

export interface OpenCodeMessagePart {
  id: string;
  messageId?: string;
  kind: 'text' | 'tool' | 'metadata';
  text?: string;
  data?: Record<string, unknown>;
}

export interface OpenCodeMessageRecord {
  id: string;
  sessionId: string;
  role?: string;
  agent?: string;
  providerID?: string;
  modelID?: string;
  tokens?: unknown;
  cost?: number;
  path?: string;
  time?: string;
  data?: Record<string, unknown>;
  parts: OpenCodeMessagePart[];
}

export interface OpenCodeSessionRecord {
  sessionId: string;
  rootSessionId: string;
  parentSessionId: string | null;
  repoPath: string;
  pathHint: string;
  createdAt: string;
  events: OpenCodeEventRow[];
  messages: OpenCodeMessageRecord[];
}

export interface OpenCodeSearchInput {
  query: string;
  fixtureDb?: string;
  liveDb?: string;
}

export interface OpenCodeSearchResult {
  results: SearchResultTree[];
  warnings: AgentscopeWarning[];
}

export interface OpenCodeTreeInput {
  sessionId: string;
  fixtureDb?: string;
  liveDb?: string;
}

export interface OpenCodeLoadInput {
  fixtureDb?: string;
  liveDb?: string;
}

export interface OpenCodeLoadResult {
  sessions: OpenCodeSessionRecord[];
  warnings: AgentscopeWarning[];
}

export interface OpenCodeResolvedTree {
  runtime: 'opencode';
  rootSessionId: string;
  sessionIds: string[];
  sessions: OpenCodeSessionRecord[];
  warnings: AgentscopeWarning[];
}

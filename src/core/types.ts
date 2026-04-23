import type { AgentscopeWarning } from './warnings.js';

export type RuntimeId = string;

export type SearchMatchSource =
  | 'message_text'
  | 'tool_use'
  | 'tool_result'
  | 'metadata'
  | 'error'
  | 'session_id';

export interface SearchMatch {
  nodeSessionId: string;
  source: SearchMatchSource;
  preview?: string; // Optional because many match sources should never surface previews.
}

export interface SearchResultTree {
  runtime: RuntimeId;
  rootSessionId: string;
  matches: SearchMatch[];
  hiddenMatchCount?: number; // Optional future-facing field for upstream truncation metadata.
}

export interface SearchResultsEnvelope {
  query: string;
  limit: number;
  truncated: boolean;
  results: SearchResultTree[];
  warnings: AgentscopeWarning[];
}

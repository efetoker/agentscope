import type { SearchMatch, SearchResultTree } from '../../core/types.js';
import type { CodexSearchInput, CodexSearchResult, CodexSessionRecord } from './types.js';
import { loadCodexSessionsWithWarnings } from './tree.js';

function normalize(value: string): string {
  return value.toLowerCase();
}

function pushMatch(matches: SearchMatch[], nodeSessionId: string, source: SearchMatch['source'], preview?: string) {
  matches.push({
    nodeSessionId,
    source,
    ...(preview ? { preview } : {}),
  });
}

function collectCodexMatches(record: CodexSessionRecord, query: string): SearchMatch[] {
  const matches: SearchMatch[] = [];
  const normalizedQuery = normalize(query);

  if (normalize(record.sessionId).includes(normalizedQuery) || normalize(record.rootSessionId).includes(normalizedQuery)) {
    pushMatch(matches, record.sessionId, 'session_id', record.sessionId);
  }

  for (const metadataValue of [record.repoPath, record.pathHint, record.timestamp]) {
    if (normalize(metadataValue).includes(normalizedQuery)) {
      pushMatch(matches, record.sessionId, 'metadata', metadataValue);
    }
  }

  for (const event of record.events) {
    if (event.rawType && normalize(event.rawType).includes(normalizedQuery)) {
      pushMatch(matches, record.sessionId, 'metadata', event.rawType);
    }

    if (normalize(event.event.text).includes(normalizedQuery)) {
      pushMatch(
        matches,
        record.sessionId,
        event.event.type === 'message' ? 'message_text' : 'tool_result',
        event.event.text,
      );
    }
  }

  return matches;
}

export async function searchCodexSessions(input: CodexSearchInput): Promise<CodexSearchResult> {
  const { sessions, warnings } = await loadCodexSessionsWithWarnings(input);
  const groupedResults = new Map<string, SearchResultTree>();

  for (const session of sessions) {
    const sessionMatches = collectCodexMatches(session, input.query);
    if (sessionMatches.length === 0) {
      continue;
    }

    const existing = groupedResults.get(session.rootSessionId) ?? {
      runtime: 'codex',
      rootSessionId: session.rootSessionId,
      matches: [],
    };

    existing.matches.push(...sessionMatches);
    groupedResults.set(session.rootSessionId, existing);
  }

  return {
    results: Array.from(groupedResults.values()),
    warnings,
  };
}

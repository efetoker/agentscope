import type { SearchMatch, SearchResultTree } from '../../core/types.js';
import type { OpenCodeSearchInput, OpenCodeSearchResult, OpenCodeSessionRecord } from './types.js';
import { loadOpenCodeSessions } from './tree.js';

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

function collectMatches(record: OpenCodeSessionRecord, query: string): SearchMatch[] {
  const matches: SearchMatch[] = [];
  const normalizedQuery = normalize(query);

  if (normalize(record.sessionId).includes(normalizedQuery) || normalize(record.rootSessionId).includes(normalizedQuery)) {
    pushMatch(matches, record.sessionId, 'session_id', record.sessionId);
  }

  for (const metadataValue of [record.repoPath, record.pathHint, record.createdAt]) {
    if (normalize(metadataValue).includes(normalizedQuery)) {
      pushMatch(matches, record.sessionId, 'metadata', metadataValue);
    }
  }

  for (const event of record.events) {
    if (normalize(event.body).includes(normalizedQuery)) {
      pushMatch(
        matches,
        record.sessionId,
        event.kind === 'message' ? 'message_text' : event.kind === 'error' ? 'error' : 'metadata',
        event.body,
      );
    }
  }

  return matches;
}

export async function searchOpenCodeSessions(input: OpenCodeSearchInput): Promise<OpenCodeSearchResult> {
  const sessions = loadOpenCodeSessions(input.fixtureDb);
  const grouped = new Map<string, SearchResultTree>();

  for (const session of sessions) {
    const sessionMatches = collectMatches(session, input.query);
    if (sessionMatches.length === 0) {
      continue;
    }

    const existing = grouped.get(session.rootSessionId) ?? {
      runtime: 'opencode',
      rootSessionId: session.rootSessionId,
      matches: [],
    };

    existing.matches.push(...sessionMatches);
    grouped.set(session.rootSessionId, existing);
  }

  return {
    results: Array.from(grouped.values()),
  };
}

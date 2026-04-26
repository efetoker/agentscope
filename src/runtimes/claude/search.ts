import type { SearchMatch, SearchResultTree } from '../../core/types.js';
import type { ClaudeSearchInput, ClaudeSearchResult, ClaudeSessionEvent, ClaudeSessionRecord } from './types.js';
import { loadClaudeSessionsWithWarnings } from './tree.js';

function normalize(value: string): string {
  return value.toLowerCase();
}

function buildMatcher(input: ClaudeSearchInput): (value: string) => boolean {
  if (input.regex) {
    let expression: RegExp;
    try {
      expression = new RegExp(input.query, 'i');
    } catch (error) {
      throw new Error(`Invalid regular expression: ${(error as Error).message}`);
    }

    return (value: string) => expression.test(value);
  }

  const query = normalize(input.query);
  return (value: string) => normalize(value).includes(query);
}

function isWithinDateRange(record: ClaudeSessionRecord, since?: string, until?: string): boolean {
  const timestamps = record.events.map((event) => event.timestamp);
  const earliest = timestamps[0];
  const latest = timestamps[timestamps.length - 1];

  if (since && latest < since) {
    return false;
  }

  if (until && earliest > until) {
    return false;
  }

  return true;
}

function matchesFilters(record: ClaudeSessionRecord, input: ClaudeSearchInput): boolean {
  if (input.repo && !normalize(record.repoPath).includes(normalize(input.repo))) {
    return false;
  }

  if (input.path && !normalize(record.pathHint).includes(normalize(input.path))) {
    return false;
  }

  if (input.here) {
    const normalizedHere = normalize(input.here);
    if (!normalize(record.pathHint).includes(normalizedHere) && !normalize(record.repoPath).includes(normalizedHere)) {
      return false;
    }
  }

  return isWithinDateRange(record, input.since, input.until);
}

function pushMatch(matches: SearchMatch[], nodeSessionId: string, source: SearchMatch['source'], preview?: string) {
  matches.push({
    nodeSessionId,
    source,
    ...(preview ? { preview } : {}),
  });
}

function collectEventMatches(event: ClaudeSessionEvent, matcher: (value: string) => boolean): SearchMatch[] {
  const matches: SearchMatch[] = [];

  if (matcher(event.sessionId) || matcher(event.rootSessionId)) {
    pushMatch(matches, event.sessionId, 'session_id', event.sessionId);
  }

  for (const metadataValue of [event.repoPath, event.cwd, event.pathHint, event.timestamp]) {
    if (matcher(metadataValue)) {
      pushMatch(matches, event.sessionId, 'metadata', metadataValue);
    }
  }

  for (const part of event.message.content) {
    if (part.type === 'text' && part.text && matcher(part.text)) {
      pushMatch(matches, event.sessionId, 'message_text', part.text);
    }

    if (part.type === 'tool_use') {
      const haystack = [part.name ?? '', JSON.stringify(part.input ?? {})].join(' ');
      if (matcher(haystack)) {
        pushMatch(matches, event.sessionId, 'tool_use', haystack);
      }
    }

    if (part.type === 'tool_result' && part.text && matcher(part.text)) {
      pushMatch(matches, event.sessionId, 'tool_result', part.text);
    }
  }

  return matches;
}

export async function searchClaudeSessions(input: ClaudeSearchInput): Promise<ClaudeSearchResult> {
  const matcher = buildMatcher(input);
  const { sessions, warnings } = await loadClaudeSessionsWithWarnings(input);
  const groupedResults = new Map<string, SearchResultTree>();

  for (const session of sessions) {
    if (!matchesFilters(session, input)) {
      continue;
    }

    const sessionMatches = session.events.flatMap((event) => collectEventMatches(event, matcher));
    if (sessionMatches.length === 0) {
      continue;
    }

    const existing = groupedResults.get(session.rootSessionId) ?? {
      runtime: 'claude',
      rootSessionId: session.rootSessionId,
      projectPath: session.pathHint || session.repoPath,
      startedAt: session.events[0]?.timestamp,
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

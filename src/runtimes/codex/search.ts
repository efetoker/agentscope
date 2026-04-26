import type { SearchMatch, SearchResultTree } from '../../core/types.js';
import { parseDateFilterBoundary } from '../../core/date-filter.js';
import type { CodexSearchInput, CodexSearchResult, CodexSessionRecord } from './types.js';
import { loadCodexSessionsWithWarnings } from './tree.js';

function normalize(value: string): string {
  return value.toLowerCase();
}

function buildMatcher(input: CodexSearchInput): (value: string) => boolean {
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

function isWithinDateRange(timestamps: string[], since?: string, until?: string): boolean {
  if (!since && !until) {
    return true;
  }

  const parsedTimestamps = timestamps
    .map((timestamp) => parseDateFilterBoundary(timestamp, 'since'))
    .filter((timestamp): timestamp is number => timestamp !== undefined);

  if (parsedTimestamps.length === 0) {
    return false;
  }

  const earliest = Math.min(...parsedTimestamps);
  const latest = Math.max(...parsedTimestamps);
  const sinceTime = parseDateFilterBoundary(since, 'since');
  const untilTime = parseDateFilterBoundary(until, 'until');

  if (sinceTime !== undefined && latest < sinceTime) {
    return false;
  }

  if (untilTime !== undefined && earliest > untilTime) {
    return false;
  }

  return true;
}

function matchesFilters(record: CodexSessionRecord, input: CodexSearchInput): boolean {
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

  return isWithinDateRange([record.timestamp, ...record.events.map((event) => event.timestamp)], input.since, input.until);
}

function pushMatch(matches: SearchMatch[], nodeSessionId: string, source: SearchMatch['source'], preview?: string) {
  matches.push({
    nodeSessionId,
    source,
    ...(preview ? { preview } : {}),
  });
}

function collectCodexMatches(record: CodexSessionRecord, matcher: (value: string) => boolean): SearchMatch[] {
  const matches: SearchMatch[] = [];

  if (matcher(record.sessionId) || matcher(record.rootSessionId)) {
    pushMatch(matches, record.sessionId, 'session_id', record.sessionId);
  }

  for (const metadataValue of [record.repoPath, record.pathHint, record.timestamp]) {
    if (matcher(metadataValue)) {
      pushMatch(matches, record.sessionId, 'metadata', metadataValue);
    }
  }

  for (const event of record.events) {
    if (event.rawType && matcher(event.rawType)) {
      pushMatch(matches, record.sessionId, 'metadata', event.rawType);
    }

    if (matcher(event.event.text)) {
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
  const matcher = buildMatcher(input);
  const { sessions, warnings } = await loadCodexSessionsWithWarnings(input);
  const groupedResults = new Map<string, SearchResultTree>();

  for (const session of sessions) {
    if (!matchesFilters(session, input)) {
      continue;
    }

    const sessionMatches = collectCodexMatches(session, matcher);
    if (sessionMatches.length === 0) {
      continue;
    }

    const existing = groupedResults.get(session.rootSessionId) ?? {
      runtime: 'codex',
      rootSessionId: session.rootSessionId,
      projectPath: session.pathHint || session.repoPath,
      startedAt: session.timestamp,
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

import type { SearchMatch, SearchResultTree } from '../../core/types.js';
import { parseDateFilterBoundary } from '../../core/date-filter.js';
import type { OpenCodeMessagePart, OpenCodeSearchInput, OpenCodeSearchResult, OpenCodeSessionRecord } from './types.js';
import { loadOpenCodeSessionsWithWarnings } from './tree.js';

function normalize(value: string): string {
  return value.toLowerCase();
}

function buildMatcher(input: OpenCodeSearchInput): (value: string) => boolean {
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

function matchesFilters(record: OpenCodeSessionRecord, input: OpenCodeSearchInput): boolean {
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

  return isWithinDateRange([record.createdAt, ...record.messages.flatMap((message) => message.time ? [message.time] : [])], input.since, input.until);
}

function pushMatch(matches: SearchMatch[], nodeSessionId: string, source: SearchMatch['source'], preview?: string) {
  matches.push({
    nodeSessionId,
    source,
    ...(preview ? { preview } : {}),
  });
}

function collectMatches(record: OpenCodeSessionRecord, matcher: (value: string) => boolean): SearchMatch[] {
  const matches: SearchMatch[] = [];

  if (matcher(record.sessionId) || matcher(record.rootSessionId)) {
    pushMatch(matches, record.sessionId, 'session_id', record.sessionId);
  }

  for (const metadataValue of [record.repoPath, record.pathHint, record.createdAt]) {
    if (matcher(metadataValue)) {
      pushMatch(matches, record.sessionId, 'metadata', metadataValue);
    }
  }

  for (const event of record.events) {
    if (matcher(event.body)) {
      pushMatch(
        matches,
        record.sessionId,
        event.kind === 'message' ? 'message_text' : event.kind === 'error' ? 'error' : 'metadata',
        event.body,
      );
    }
  }

  for (const message of record.messages) {
    for (const metadataValue of [
      message.role,
      message.agent,
      message.providerID,
      message.modelID,
      message.path,
      message.time,
    ]) {
      if (metadataValue && matcher(metadataValue)) {
        pushMatch(matches, record.sessionId, 'metadata', metadataValue);
      }
    }

    for (const part of message.parts) {
      const searchable = part.text ?? JSON.stringify(part.data ?? {});
      if (!matcher(searchable)) {
        continue;
      }

      pushMatch(matches, record.sessionId, sourceForPart(part), searchable);
    }
  }

  return matches;
}

function sourceForPart(part: OpenCodeMessagePart): SearchMatch['source'] {
  return part.kind === 'tool' ? 'tool_result' : part.kind === 'text' ? 'message_text' : 'metadata';
}

export async function searchOpenCodeSessions(input: OpenCodeSearchInput): Promise<OpenCodeSearchResult> {
  const matcher = buildMatcher(input);
  const { sessions, warnings } = loadOpenCodeSessionsWithWarnings(input);
  const grouped = new Map<string, SearchResultTree>();

  for (const session of sessions) {
    if (!matchesFilters(session, input)) {
      continue;
    }

    const sessionMatches = collectMatches(session, matcher);
    if (sessionMatches.length === 0) {
      continue;
    }

    const existing = grouped.get(session.rootSessionId) ?? {
      runtime: 'opencode',
      rootSessionId: session.rootSessionId,
      projectPath: session.pathHint || session.repoPath,
      startedAt: session.createdAt,
      matches: [],
    };

    existing.matches.push(...sessionMatches);
    grouped.set(session.rootSessionId, existing);
  }

  return {
    results: Array.from(grouped.values()),
    warnings,
  };
}

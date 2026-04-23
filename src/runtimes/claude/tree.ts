import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import type { ClaudeResolvedTree, ClaudeSessionEvent, ClaudeSessionRecord, ClaudeTreeInput } from './types.js';

function byTimestamp(a: ClaudeSessionEvent, b: ClaudeSessionEvent): number {
  return a.timestamp.localeCompare(b.timestamp);
}

export async function loadClaudeSessions(fixturesRoot: string): Promise<ClaudeSessionRecord[]> {
  const entries = await readdir(fixturesRoot, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
    .map((entry) => path.join(fixturesRoot, entry.name))
    .sort();

  const sessions: ClaudeSessionRecord[] = [];

  for (const file of files) {
    const raw = await readFile(file, 'utf8');
    const events = raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ClaudeSessionEvent)
      .sort(byTimestamp);

    if (events.length === 0) {
      continue;
    }

    const first = events[0];
    sessions.push({
      sessionId: first.sessionId,
      rootSessionId: first.rootSessionId,
      parentSessionId: first.parentSessionId,
      repoPath: first.repoPath,
      cwd: first.cwd,
      pathHint: first.pathHint,
      sourcePath: file,
      events,
    });
  }

  return sessions.sort((left, right) => {
    if (left.rootSessionId !== right.rootSessionId) {
      return left.rootSessionId.localeCompare(right.rootSessionId);
    }

    if (left.parentSessionId === null && right.parentSessionId !== null) {
      return -1;
    }

    if (left.parentSessionId !== null && right.parentSessionId === null) {
      return 1;
    }

    return left.sessionId.localeCompare(right.sessionId);
  });
}

function resolveSessionMatch(sessions: ClaudeSessionRecord[], sessionId: string): ClaudeSessionRecord {
  const normalized = sessionId.toLowerCase();
  const matches = sessions.filter((session) => session.sessionId.toLowerCase().includes(normalized));

  if (matches.length === 0) {
    throw new Error(`Claude session not found: ${sessionId}`);
  }

  if (matches.length > 1) {
    throw new Error(`Ambiguous Claude session id: ${sessionId}`);
  }

  return matches[0];
}

export async function expandClaudeTree(input: ClaudeTreeInput): Promise<ClaudeResolvedTree> {
  const sessions = await loadClaudeSessions(input.fixturesRoot);
  const matched = resolveSessionMatch(sessions, input.sessionId);
  const treeSessions = sessions.filter((session) => session.rootSessionId === matched.rootSessionId);

  return {
    runtime: 'claude',
    rootSessionId: matched.rootSessionId,
    sessionIds: treeSessions.map((session) => session.sessionId),
    sessions: treeSessions,
  };
}

import Database from 'better-sqlite3';

import type {
  OpenCodeEventRow,
  OpenCodeResolvedTree,
  OpenCodeSessionRecord,
  OpenCodeSessionRow,
  OpenCodeTreeInput,
} from './types.js';

export function loadOpenCodeSessions(fixtureDb: string): OpenCodeSessionRecord[] {
  const db = new Database(fixtureDb, { readonly: true });

  try {
    const sessionRows = db
      .prepare<OpenCodeSessionRow>(
        'SELECT id, root_id, parent_id, repo_path, path_hint, created_at FROM sessions ORDER BY created_at, id',
      )
      .all();

    const eventRows = db
      .prepare<OpenCodeEventRow>('SELECT id, session_id, kind, body FROM events ORDER BY id')
      .all();

    const eventsBySession = new Map<string, OpenCodeEventRow[]>();
    for (const event of eventRows) {
      const bucket = eventsBySession.get(event.session_id) ?? [];
      bucket.push(event);
      eventsBySession.set(event.session_id, bucket);
    }

    return sessionRows.map((row) => ({
      sessionId: row.id,
      rootSessionId: row.root_id,
      parentSessionId: row.parent_id,
      repoPath: row.repo_path,
      pathHint: row.path_hint,
      createdAt: row.created_at,
      events: eventsBySession.get(row.id) ?? [],
    }));
  } finally {
    db.close();
  }
}

function resolveOpenCodeMatch(records: OpenCodeSessionRecord[], sessionId: string): OpenCodeSessionRecord {
  const matches = records.filter((record) => record.sessionId.toLowerCase().includes(sessionId.toLowerCase()));

  if (matches.length === 0) {
    throw new Error(`OpenCode session not found: ${sessionId}`);
  }

  if (matches.length > 1) {
    throw new Error(`Ambiguous OpenCode session id: ${sessionId}`);
  }

  return matches[0];
}

export async function expandOpenCodeTree(input: OpenCodeTreeInput): Promise<OpenCodeResolvedTree> {
  const sessions = loadOpenCodeSessions(input.fixtureDb);
  const matched = resolveOpenCodeMatch(sessions, input.sessionId);
  const treeSessions = sessions.filter((session) => session.rootSessionId === matched.rootSessionId);

  return {
    runtime: 'opencode',
    rootSessionId: matched.rootSessionId,
    sessionIds: treeSessions.map((session) => session.sessionId),
    sessions: treeSessions,
  };
}

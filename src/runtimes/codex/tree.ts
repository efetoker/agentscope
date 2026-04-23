import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  CodexResolvedTree,
  CodexRolloutEvent,
  CodexSessionIndexEntry,
  CodexSessionRecord,
  CodexTreeInput,
} from './types.js';

async function loadSessionIndex(fixturesRoot: string): Promise<CodexSessionIndexEntry[]> {
  const raw = await readFile(path.join(fixturesRoot, 'session_index.jsonl'), 'utf8');

  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as CodexSessionIndexEntry);
}

async function loadRollout(fixturesRoot: string, rolloutPath: string): Promise<CodexRolloutEvent[]> {
  const raw = await readFile(path.join(fixturesRoot, rolloutPath), 'utf8');

  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as CodexRolloutEvent)
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}

export async function loadCodexSessions(fixturesRoot: string): Promise<CodexSessionRecord[]> {
  const index = await loadSessionIndex(fixturesRoot);

  return Promise.all(
    index.map(async (entry) => ({
      sessionId: entry.session_id,
      rootSessionId: entry.root_session_id,
      parentSessionId: entry.parent_session_id,
      repoPath: entry.repo_path,
      pathHint: entry.path_hint,
      timestamp: entry.timestamp,
      rolloutPath: entry.rollout_path,
      events: await loadRollout(fixturesRoot, entry.rollout_path),
    })),
  );
}

function resolveCodexMatch(sessions: CodexSessionRecord[], sessionId: string): CodexSessionRecord {
  const normalized = sessionId.toLowerCase();
  const matches = sessions.filter((session) => session.sessionId.toLowerCase().includes(normalized));

  if (matches.length === 0) {
    throw new Error(`Codex session not found: ${sessionId}`);
  }

  if (matches.length > 1) {
    throw new Error(`Ambiguous Codex session id: ${sessionId}`);
  }

  return matches[0];
}

export async function expandCodexTree(input: CodexTreeInput): Promise<CodexResolvedTree> {
  const sessions = await loadCodexSessions(input.fixturesRoot);
  const matched = resolveCodexMatch(sessions, input.sessionId);
  const treeSessions = sessions.filter((session) => session.rootSessionId === matched.rootSessionId);

  return {
    runtime: 'codex',
    rootSessionId: matched.rootSessionId,
    sessionIds: treeSessions.map((session) => session.sessionId),
    sessions: treeSessions,
  };
}

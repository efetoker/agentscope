import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

import { searchOpenCodeSessions } from '../../../src/runtimes/opencode/search.js';
import { expandOpenCodeTree } from '../../../src/runtimes/opencode/tree.js';

async function createLiveOpenCodeDb(): Promise<{ dbPath: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agentscope-opencode-live-'));
  const dbPath = path.join(dir, 'opencode.db');
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE project (id TEXT PRIMARY KEY, worktree TEXT);
    CREATE TABLE session (id TEXT PRIMARY KEY, project_id TEXT, parent_id TEXT, directory TEXT, slug TEXT NOT NULL, title TEXT NOT NULL, version TEXT NOT NULL, time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL);
    CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, data TEXT);
    CREATE TABLE part (id TEXT PRIMARY KEY, session_id TEXT, message_id TEXT, data TEXT);
  `);
  db.prepare('INSERT INTO project (id, worktree) VALUES (?, ?)').run('project-1', '/workspace/project');
  db.prepare('INSERT INTO session (id, project_id, parent_id, directory, slug, title, version, time_created, time_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    'oc-live-root',
    'project-1',
    null,
    '/workspace/project',
    'root',
    'Root',
    '1.0.0',
    1777161600000,
    1777161600000,
  );
  db.prepare('INSERT INTO session (id, project_id, parent_id, directory, slug, title, version, time_created, time_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    'oc-live-child',
    'project-1',
    'oc-live-root',
    '/workspace/project/subdir',
    'child',
    'Child',
    '1.0.0',
    1777161660000,
    1777161660000,
  );
  db.prepare('INSERT INTO message (id, session_id, data) VALUES (?, ?, ?)').run(
    'message-1',
    'oc-live-child',
    JSON.stringify({
      role: 'user',
      agent: 'build',
      model: {
        providerID: 'anthropic',
        modelID: 'claude-sonnet',
      },
      tokens: { input: 12, output: 34 },
      cost: 0.01,
      path: {
        cwd: '/workspace/project/subdir',
        root: '/workspace/project',
      },
      time: {
        created: '2026-04-26T00:00:00.000Z',
        completed: '2026-04-26T00:01:00.000Z',
      },
    }),
  );
  db.prepare('INSERT INTO part (id, session_id, message_id, data) VALUES (?, ?, ?, ?)').run(
    'part-1',
    'oc-live-child',
    'message-1',
    JSON.stringify({ type: 'text', text: 'proxy configuration details' }),
  );
  db.prepare('INSERT INTO part (id, session_id, message_id, data) VALUES (?, ?, ?, ?)').run(
    'part-2',
    'oc-live-child',
    'message-1',
    JSON.stringify({ type: 'tool', name: 'migration', input: { command: 'migration preview' } }),
  );
  db.close();

  return {
    dbPath,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

describe('OpenCode tree expansion', () => {
  it('expands a child session to its root tree', async () => {
    const tree = await expandOpenCodeTree({
      sessionId: 'oc-child-1',
      fixtureDb: 'fixtures/opencode/opencode.db',
    });

    expect(tree.rootSessionId).toBe('oc-root-1');
    expect(tree.sessionIds).toContain('oc-root-1');
    expect(tree.sessionIds).toContain('oc-child-1');
  });

  it('loads live OpenCode SQLite sessions from project session message and part tables', async () => {
    const fixture = await createLiveOpenCodeDb();
    try {
      const tree = await expandOpenCodeTree({
        sessionId: 'oc-live-child',
        liveDb: fixture.dbPath,
      });

      expect(tree.rootSessionId).toBe('oc-live-root');
      expect(tree.sessionIds).toEqual(['oc-live-root', 'oc-live-child']);
      expect(tree.sessions[1].messages[0]).toMatchObject({
        providerID: 'anthropic',
        modelID: 'claude-sonnet',
        path: '/workspace/project/subdir /workspace/project',
        time: '2026-04-26T00:00:00.000Z 2026-04-26T00:01:00.000Z',
      });
      expect(tree.sessions[1].messages[0].parts.length).toBeGreaterThan(0);
    } finally {
      await fixture.cleanup();
    }
  });

  it('searches nested live OpenCode message metadata', async () => {
    const fixture = await createLiveOpenCodeDb();
    try {
      const result = await searchOpenCodeSessions({
        query: '2026-04-26T00:01:00.000Z',
        liveDb: fixture.dbPath,
      });

      expect(result.results[0].matches).toContainEqual(
        expect.objectContaining({
          nodeSessionId: 'oc-live-child',
          source: 'metadata',
          preview: '2026-04-26T00:00:00.000Z 2026-04-26T00:01:00.000Z',
        }),
      );
    } finally {
      await fixture.cleanup();
    }
  });
});

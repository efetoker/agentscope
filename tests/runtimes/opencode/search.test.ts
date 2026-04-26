import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

import { searchOpenCodeSessions } from '../../../src/runtimes/opencode/search.js';

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
  db.prepare('INSERT INTO session (id, project_id, parent_id, directory, slug, title, version, time_created, time_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('oc-live-root', 'project-1', null, '/workspace/project', 'root', 'Root', '1.0.0', 1777161600000, 1777161600000);
  db.prepare('INSERT INTO session (id, project_id, parent_id, directory, slug, title, version, time_created, time_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('oc-live-child', 'project-1', 'oc-live-root', '/workspace/project/subdir', 'child', 'Child', '1.0.0', 1777161660000, 1777161660000);
  db.prepare('INSERT INTO message (id, session_id, data) VALUES (?, ?, ?)').run('message-1', 'oc-live-child', JSON.stringify({ role: 'user', agent: 'build', providerID: 'anthropic', modelID: 'claude-sonnet', path: 'src/index.ts', time: '2026-04-26T00:00:00.000Z' }));
  db.prepare('INSERT INTO part (id, session_id, message_id, data) VALUES (?, ?, ?, ?)').run('part-1', 'oc-live-child', 'message-1', JSON.stringify({ type: 'text', text: 'proxy configuration details' }));
  db.close();

  return { dbPath, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

describe('OpenCode search adapter', () => {
  it('finds message and metadata matches from the SQLite fixture', async () => {
    const result = await searchOpenCodeSessions({
      query: 'proxy',
      fixtureDb: 'fixtures/opencode/opencode.db',
    });

    expect(result.results[0].runtime).toBe('opencode');
    expect(result.results[0].rootSessionId).toBe('oc-root-1');
  });

  it('searches live OpenCode message and part payloads', async () => {
    const fixture = await createLiveOpenCodeDb();
    try {
      const result = await searchOpenCodeSessions({
        query: 'proxy',
        liveDb: fixture.dbPath,
      });

      expect(result.results[0].runtime).toBe('opencode');
      expect(result.results[0].rootSessionId).toBe('oc-live-root');
      expect(result.results[0].matches.some((match) => match.source === 'message_text' || match.source === 'tool_result')).toBe(true);
    } finally {
      await fixture.cleanup();
    }
  });

  it('applies shared metadata and date filters', async () => {
    const base = {
      query: 'proxy',
      fixtureDb: 'fixtures/opencode/opencode.db',
    };

    await expect(searchOpenCodeSessions({ ...base, repo: 'definitely-not-a-real-repo' })).resolves.toMatchObject({
      results: [],
      warnings: [],
    });
    await expect(searchOpenCodeSessions({ ...base, path: 'definitely-not-a-real-path' })).resolves.toMatchObject({
      results: [],
      warnings: [],
    });
    await expect(searchOpenCodeSessions({ ...base, here: 'definitely-not-a-real-path' })).resolves.toMatchObject({
      results: [],
      warnings: [],
    });
    await expect(searchOpenCodeSessions({ ...base, since: '2999-01-01' })).resolves.toMatchObject({
      results: [],
      warnings: [],
    });
    await expect(searchOpenCodeSessions({ ...base, until: '1999-01-01' })).resolves.toMatchObject({
      results: [],
      warnings: [],
    });
  });

  it('supports regex search when requested', async () => {
    const result = await searchOpenCodeSessions({
      query: 'proxy.*ordering',
      fixtureDb: 'fixtures/opencode/opencode.db',
      regex: true,
    });

    expect(result.results[0].rootSessionId).toBe('oc-root-1');
    expect(result.results[0].matches.some((match) => match.nodeSessionId === 'oc-child-1')).toBe(true);
  });
});

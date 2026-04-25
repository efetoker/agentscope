import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

import { prepareOpenCodeBundle } from '../../../src/runtimes/opencode/export.js';

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

describe('OpenCode export adapter', () => {
  it('prepares runtime-native bundle inputs from the fixture DB', async () => {
    const bundle = await prepareOpenCodeBundle({
      sessionId: 'oc-child-1',
      fixtureDb: 'fixtures/opencode/opencode.db',
    });

    expect(bundle.runtime).toBe('opencode');
    expect(bundle.resolvedRootSessionId).toBe('oc-root-1');
    expect(bundle.includedSessionIds).toEqual(['oc-root-1', 'oc-child-1']);
    expect(bundle.payloadFiles.length).toBeGreaterThan(0);
  });

  it('prepares live OpenCode bundle inputs without unsafe queried source paths', async () => {
    const fixture = await createLiveOpenCodeDb();
    try {
      const bundle = await prepareOpenCodeBundle({
        sessionId: 'oc-live-child',
        liveDb: fixture.dbPath,
      });

      expect(bundle.runtime).toBe('opencode');
      expect(bundle.resolvedRootSessionId).toBe('oc-live-root');
      expect(bundle.payloadFiles.map((file) => file.relativePath)).toContain('opencode-tree.json');
      expect(JSON.stringify(bundle.queriedSources)).not.toMatch(/\/Users\/|\/home\//);
    } finally {
      await fixture.cleanup();
    }
  });
});

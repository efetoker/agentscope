import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execa } from 'execa';
import Database from 'better-sqlite3';

const fixtureEnv = {
  AGENTSCOPE_FIXTURES_MODE: '1',
  AGENTSCOPE_FIXTURES_ROOT: 'fixtures/claude/sample-project',
  AGENTSCOPE_CODEX_FIXTURES_ROOT: 'fixtures/codex',
  AGENTSCOPE_OPENCODE_DB: 'fixtures/opencode/opencode.db',
};

const createdPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdPaths.splice(0).map((targetPath) =>
      rm(targetPath, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

function extractPath(output: string, label: string): string {
  const line = output.split('\n').find((candidate) => candidate.startsWith(`${label}: `));
  if (!line) {
    throw new Error(`Missing ${label} in output: ${output}`);
  }

  return line.slice(label.length + 2).trim();
}

async function createLiveOpenCodeDb(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agentscope-opencode-live-'));
  createdPaths.push(dir);
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
  return dbPath;
}

describe('OpenCode command path', () => {
  it('searches OpenCode data through the shared CLI contract', async () => {
    const result = await execa('node', ['dist/cli.js', 'search', 'proxy', '--agent', 'opencode', '--json'], {
      reject: false,
      env: fixtureEnv,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.results[0].runtime).toBe('opencode');
    expect(parsed.results[0].rootSessionId).toBe('oc-root-1');
  });

  it('shows and exports OpenCode trees through the shared CLI contract', async () => {
    const showResult = await execa('node', ['dist/cli.js', 'show', 'oc-child-1', '--agent', 'opencode'], {
      reject: false,
      env: fixtureEnv,
    });

    expect(showResult.exitCode).toBe(0);
    const manifestPath = extractPath(showResult.stdout, 'Manifest path');
    createdPaths.push(path.dirname(manifestPath));
    const showManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    expect(showManifest.includedSessionIds).toEqual(['oc-root-1', 'oc-child-1']);

    const outDir = await mkdtemp(path.join(os.tmpdir(), 'agentscope-opencode-export-'));
    createdPaths.push(outDir);
    const exportResult = await execa('node', ['dist/cli.js', 'export', 'oc-child-1', '--agent', 'opencode', '--out', outDir], {
      reject: false,
      env: fixtureEnv,
    });

    expect(exportResult.exitCode).toBe(0);
    const bundlePath = extractPath(exportResult.stdout, 'Bundle path');
    const exportManifest = JSON.parse(await readFile(path.join(bundlePath, 'manifest.json'), 'utf8'));
    expect(exportManifest.includedSessionIds).toEqual(['oc-root-1', 'oc-child-1']);
  });

  it('searches shows and exports OpenCode data in non-fixture live mode', async () => {
    const dbPath = await createLiveOpenCodeDb();
    const liveEnv = { AGENTSCOPE_OPENCODE_DB: dbPath };

    const searchResult = await execa('node', ['dist/cli.js', 'search', 'proxy', '--agent', 'opencode', '--json'], {
      reject: false,
      env: liveEnv,
    });

    expect(searchResult.exitCode).toBe(0);
    expect(searchResult.stdout).not.toContain('All targeted runtimes failed');
    expect(JSON.parse(searchResult.stdout).results[0].rootSessionId).toBe('oc-live-root');

    const showResult = await execa('node', ['dist/cli.js', 'show', 'oc-live-child', '--agent', 'opencode', '--json'], {
      reject: false,
      env: liveEnv,
    });

    expect(showResult.exitCode).toBe(0);
    const showParsed = JSON.parse(showResult.stdout);
    expect(showParsed.resolved_runtime).toBe('opencode');
    createdPaths.push(path.dirname(showParsed.manifest_path));

    const outDir = await mkdtemp(path.join(os.tmpdir(), 'agentscope-opencode-live-export-'));
    createdPaths.push(outDir);
    const exportResult = await execa('node', ['dist/cli.js', 'export', 'oc-live-child', '--agent', 'opencode', '--out', outDir], {
      reject: false,
      env: liveEnv,
    });

    expect(exportResult.exitCode).toBe(0);
    expect(exportResult.stdout).not.toContain('All targeted runtimes failed');
  });
});

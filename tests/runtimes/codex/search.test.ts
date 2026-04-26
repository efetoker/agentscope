import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { searchCodexSessions } from '../../../src/runtimes/codex/search.js';

const createdPaths: string[] = [];

afterEach(async () => {
  await Promise.all(createdPaths.splice(0).map((target) => rm(target, { recursive: true, force: true })));
});

async function createCodexHome(): Promise<string> {
  const codexHome = await mkdtemp(path.join(os.tmpdir(), 'agentscope-codex-search-'));
  createdPaths.push(codexHome);
  await mkdir(path.join(codexHome, 'sessions'), { recursive: true });
  await writeFile(
    path.join(codexHome, 'session_index.jsonl'),
    `${JSON.stringify({
      session_id: 'codex-root-1',
      root_session_id: 'codex-root-1',
      parent_session_id: null,
      rollout_path: 'sessions/rollout-root.jsonl',
      repo_path: '/workspace/project',
      path_hint: '/workspace/project',
      timestamp: '2026-04-26T00:00:00.000Z',
    })}\n`,
  );
  await writeFile(
    path.join(codexHome, 'sessions', 'rollout-root.jsonl'),
    `${JSON.stringify({
      type: 'event_msg',
      session_id: 'codex-root-1',
      root_session_id: 'codex-root-1',
      timestamp: '2026-04-26T00:00:01.000Z',
      message: { role: 'user', content: 'codex live adapter' },
    })}\n`,
  );
  return codexHome;
}

describe('Codex search adapter', () => {
  it('finds text and session-id matches from rollout fixtures', async () => {
    const result = await searchCodexSessions({
      query: '019dab',
      fixturesRoot: 'fixtures/codex',
    });

    expect(result.results[0].runtime).toBe('codex');
    expect(result.results[0].rootSessionId).toBe('019dab34-c95a-7bf1-a0f7-817dd7bed87d');
    expect(result.results[0].matches.length).toBeGreaterThan(0);
  });

  it('keeps fixture data suitable for partial-id ambiguity cases later', async () => {
    const result = await searchCodexSessions({
      query: 'partial',
      fixturesRoot: 'fixtures/codex',
    });

    expect(result.results[0].matches[0].nodeSessionId).toBe('child-019dab');
  });

  it('finds text matches from live Codex rollout stores', async () => {
    const codexHome = await createCodexHome();

    const result = await searchCodexSessions({
      query: 'codex live adapter',
      liveCodexHome: codexHome,
    });

    expect(result.warnings).toEqual([]);
    expect(result.results[0].runtime).toBe('codex');
    expect(result.results[0].rootSessionId).toBe('codex-root-1');
  });

  it('applies shared metadata and date filters', async () => {
    const base = {
      query: 'proxy',
      fixturesRoot: 'fixtures/codex',
    };

    await expect(searchCodexSessions({ ...base, repo: 'definitely-not-a-real-repo' })).resolves.toMatchObject({
      results: [],
      warnings: [],
    });
    await expect(searchCodexSessions({ ...base, path: 'definitely-not-a-real-path' })).resolves.toMatchObject({
      results: [],
      warnings: [],
    });
    await expect(searchCodexSessions({ ...base, here: 'definitely-not-a-real-path' })).resolves.toMatchObject({
      results: [],
      warnings: [],
    });
    await expect(searchCodexSessions({ ...base, since: '2999-01-01' })).resolves.toMatchObject({
      results: [],
      warnings: [],
    });
    await expect(searchCodexSessions({ ...base, until: '1999-01-01' })).resolves.toMatchObject({
      results: [],
      warnings: [],
    });
  });

  it('supports regex search when requested', async () => {
    const result = await searchCodexSessions({
      query: 'proxy.*ordering',
      fixturesRoot: 'fixtures/codex',
      regex: true,
    });

    expect(result.results[0].rootSessionId).toBe('019dab34-c95a-7bf1-a0f7-817dd7bed87d');
    expect(result.results[0].matches.some((match) => match.nodeSessionId === 'child-019dab')).toBe(true);
  });
});

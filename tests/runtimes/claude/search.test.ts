import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { searchClaudeSessions } from '../../../src/runtimes/claude/search.js';

async function createLiveClaudeProjectsRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agentscope-claude-search-'));
  const projectsDir = path.join(root, '.claude', 'projects');
  const projectDir = path.join(projectsDir, 'project-one');
  await mkdir(projectDir, { recursive: true });
  await writeFile(
    path.join(projectDir, 'root-session.jsonl'),
    [
      JSON.stringify({
        sessionId: 'claude-live-root',
        uuid: 'event-1',
        parentUuid: null,
        timestamp: '2026-04-25T10:00:00.000Z',
        cwd: '/Users/synthetic/project-one',
        type: 'user',
        message: { content: [{ type: 'text', text: 'Investigate middleware behavior' }] },
      }),
      '{not-json',
    ].join('\n'),
  );

  return { root, projectsDir };
}

describe('Claude search adapter', () => {
  it('returns grouped root-tree results for proxy matches', async () => {
    const result = await searchClaudeSessions({
      query: 'proxy',
      fixturesRoot: 'fixtures/claude/sample-project',
    });

    expect(result.results[0].runtime).toBe('claude');
    expect(result.results[0].rootSessionId).toBe('claude-root-1');
    expect(result.results[0].matches.length).toBeGreaterThan(0);
    expect(result.results[0].matches.some((match) => match.source === 'message_text')).toBe(true);
  });

  it('matches literals case-insensitively by default', async () => {
    const result = await searchClaudeSessions({
      query: 'PROXY',
      fixturesRoot: 'fixtures/claude/sample-project',
    });

    expect(result.results[0].rootSessionId).toBe('claude-root-1');
  });

  it('supports regex search when requested', async () => {
    const result = await searchClaudeSessions({
      query: 'proxy.*middleware',
      fixturesRoot: 'fixtures/claude/sample-project',
      regex: true,
    });

    expect(result.results[0].matches.some((match) => match.nodeSessionId === 'claude-child-1')).toBe(true);
  });

  it('fails fast on invalid regex input', async () => {
    await expect(
      searchClaudeSessions({
        query: '[',
        fixturesRoot: 'fixtures/claude/sample-project',
        regex: true,
      }),
    ).rejects.toThrow(/regular expression|regex/i);
  });

  it('searches live Claude JSONL stores without fixture mode', async () => {
    const { root, projectsDir } = await createLiveClaudeProjectsRoot();
    try {
      const result = await searchClaudeSessions({
        query: 'middleware',
        liveProjectsRoot: projectsDir,
      });

      expect(result.results[0].runtime).toBe('claude');
      expect(result.results[0].rootSessionId).toBe('claude-live-root');
      expect(result.results[0].matches.some((match) => match.source === 'message_text')).toBe(true);
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'claude_jsonl_malformed', runtime: 'claude', severity: 'warning' }),
        ]),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('excludes the active Claude session from live search results', async () => {
    const { root, projectsDir } = await createLiveClaudeProjectsRoot();
    try {
      const result = await searchClaudeSessions({
        query: 'middleware',
        liveProjectsRoot: projectsDir,
        activeSessionId: 'claude-live-root',
      });

      expect(result.results).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

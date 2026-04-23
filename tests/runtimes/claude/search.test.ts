import { describe, expect, it } from 'vitest';

import { searchClaudeSessions } from '../../../src/runtimes/claude/search.js';

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
});

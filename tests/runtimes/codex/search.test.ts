import { describe, expect, it } from 'vitest';

import { searchCodexSessions } from '../../../src/runtimes/codex/search.js';

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
});

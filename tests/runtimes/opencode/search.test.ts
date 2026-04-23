import { describe, expect, it } from 'vitest';

import { searchOpenCodeSessions } from '../../../src/runtimes/opencode/search.js';

describe('OpenCode search adapter', () => {
  it('finds message and metadata matches from the SQLite fixture', async () => {
    const result = await searchOpenCodeSessions({
      query: 'proxy',
      fixtureDb: 'fixtures/opencode/opencode.db',
    });

    expect(result.results[0].runtime).toBe('opencode');
    expect(result.results[0].rootSessionId).toBe('oc-root-1');
  });
});

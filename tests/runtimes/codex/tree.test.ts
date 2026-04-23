import { describe, expect, it } from 'vitest';

import { expandCodexTree } from '../../../src/runtimes/codex/tree.js';

describe('Codex tree expansion', () => {
  it('expands a child thread to the whole root tree', async () => {
    const tree = await expandCodexTree({
      sessionId: 'child-019dab',
      fixturesRoot: 'fixtures/codex',
    });

    expect(tree.rootSessionId).toBe('019dab34-c95a-7bf1-a0f7-817dd7bed87d');
    expect(tree.sessionIds).toContain('019dab34-c95a-7bf1-a0f7-817dd7bed87d');
    expect(tree.sessionIds).toContain('child-019dab');
  });
});

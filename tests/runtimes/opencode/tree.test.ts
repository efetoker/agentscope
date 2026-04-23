import { describe, expect, it } from 'vitest';

import { expandOpenCodeTree } from '../../../src/runtimes/opencode/tree.js';

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
});

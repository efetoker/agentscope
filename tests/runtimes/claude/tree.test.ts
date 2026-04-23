import { describe, expect, it } from 'vitest';

import { expandClaudeTree } from '../../../src/runtimes/claude/tree.js';

describe('Claude tree expansion', () => {
  it('expands a child session to the full root tree', async () => {
    const tree = await expandClaudeTree({
      sessionId: 'claude-child-1',
      fixturesRoot: 'fixtures/claude/sample-project',
    });

    expect(tree.rootSessionId).toBe('claude-root-1');
    expect(tree.sessionIds).toContain('claude-root-1');
    expect(tree.sessionIds).toContain('claude-child-1');
  });
});

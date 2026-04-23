import { describe, expect, it } from 'vitest';

import { prepareOpenCodeBundle } from '../../../src/runtimes/opencode/export.js';

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
});

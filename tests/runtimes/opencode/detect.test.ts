import { describe, expect, it } from 'vitest';

import { detectOpenCodeRuntime } from '../../../src/runtimes/opencode/detect.js';

describe('OpenCode detect adapter', () => {
  it('reports fixture-backed config/data/db paths through the shared contract', async () => {
    const report = await detectOpenCodeRuntime({
      configRoot: 'fixtures/opencode',
      dataRoot: 'fixtures/opencode',
      dbPath: 'fixtures/opencode/opencode.db',
    });

    expect(report.runtime).toBe('opencode');
    expect(report.detected).toBe(true);
    expect(report.stores.some((store) => store.name === 'db')).toBe(true);
  });
});

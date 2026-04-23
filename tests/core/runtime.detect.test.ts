import { describe, expect, it } from 'vitest';

import { createRuntimeRegistry } from '../../src/core/runtime/registry.js';
import { detectAllRuntimes, type RuntimeDoctorReport } from '../../src/core/runtime/detect.js';

function makeReport(overrides: Partial<RuntimeDoctorReport> & Pick<RuntimeDoctorReport, 'runtime'>): RuntimeDoctorReport {
  return {
    runtime: overrides.runtime,
    detected: false,
    repo_status: 'unavailable',
    path_status: 'unavailable',
    paths: {},
    stores: [],
    sanity: [],
    warnings: [],
    ...overrides,
  };
}

describe('runtime registry', () => {
  it('enumerates the supported runtimes in one place', () => {
    const registry = createRuntimeRegistry({
      claude: async () => makeReport({ runtime: 'claude' }),
      codex: async () => makeReport({ runtime: 'codex' }),
      opencode: async () => makeReport({ runtime: 'opencode' }),
    });

    expect(registry.map((entry) => entry.runtime)).toEqual(['claude', 'codex', 'opencode']);
  });
});

describe('detectAllRuntimes', () => {
  it('returns structured runtime reports for detected, missing, and partial runtimes', async () => {
    const reports = await detectAllRuntimes({
      detectors: {
        claude: async () =>
          makeReport({
            runtime: 'claude',
            detected: true,
            paths: {
              root: '/fixtures/.claude',
            },
            stores: [
              { name: 'projects', path: '/fixtures/.claude/projects', status: 'present' },
            ],
            sanity: [{ name: 'projects', status: 'ok', message: 'projects directory readable' }],
          }),
        codex: async () =>
          makeReport({
            runtime: 'codex',
            detected: false,
            paths: {
              root: '/fixtures/.codex',
            },
            stores: [
              { name: 'sessions', path: '/fixtures/.codex/sessions', status: 'missing' },
            ],
            sanity: [{ name: 'sessions', status: 'warning', message: 'sessions directory missing' }],
            warnings: [{ code: 'runtime_missing', runtime: 'codex', message: 'Codex runtime not found' }],
          }),
        opencode: async () =>
          makeReport({
            runtime: 'opencode',
            detected: true,
            paths: {
              root: '/fixtures/opencode',
            },
            stores: [
              { name: 'db', path: '/fixtures/opencode/opencode.db', status: 'partial' },
            ],
            sanity: [{ name: 'db', status: 'warning', message: 'database sidecars missing' }],
            warnings: [{ code: 'layout_partial', runtime: 'opencode', message: 'database sidecars missing' }],
          }),
      },
    });

    expect(reports).toHaveLength(3);
    expect(reports[0]).toMatchObject({
      runtime: 'claude',
      detected: true,
    });
    expect(reports[1]).toMatchObject({
      runtime: 'codex',
      detected: false,
    });
    expect(reports[2]).toMatchObject({
      runtime: 'opencode',
      detected: true,
    });

    for (const report of reports) {
      expect(report).toHaveProperty('runtime');
      expect(report).toHaveProperty('detected');
      expect(report).toHaveProperty('paths');
      expect(report).toHaveProperty('stores');
      expect(report).toHaveProperty('sanity');
      expect(report).toHaveProperty('warnings');
    }

    expect(reports[1].warnings[0]).toMatchObject({ code: 'runtime_missing' });
    expect(reports[2].warnings[0]).toMatchObject({ code: 'layout_partial' });
  });

  it('isolates one failing runtime probe from the others', async () => {
    const reports = await detectAllRuntimes({
      detectors: {
        claude: async () =>
          makeReport({
            runtime: 'claude',
            detected: true,
            paths: { root: '/fixtures/.claude' },
            stores: [{ name: 'projects', path: '/fixtures/.claude/projects', status: 'present' }],
            sanity: [{ name: 'projects', status: 'ok', message: 'projects directory readable' }],
          }),
        codex: async () => {
          throw new Error('bad codex probe');
        },
        opencode: async () =>
          makeReport({
            runtime: 'opencode',
            detected: false,
            paths: { root: '/fixtures/opencode' },
            stores: [{ name: 'db', path: '/fixtures/opencode/opencode.db', status: 'missing' }],
            sanity: [{ name: 'db', status: 'warning', message: 'db missing' }],
            warnings: [{ code: 'runtime_missing', runtime: 'opencode', message: 'OpenCode runtime not found' }],
          }),
      },
    });

    expect(reports).toHaveLength(3);
    expect(reports.find((report) => report.runtime === 'claude')?.detected).toBe(true);
    expect(reports.find((report) => report.runtime === 'opencode')?.warnings[0]?.code).toBe('runtime_missing');
    expect(reports.find((report) => report.runtime === 'codex')?.warnings[0]).toMatchObject({
      code: 'probe_failed',
      runtime: 'codex',
    });
  });
});

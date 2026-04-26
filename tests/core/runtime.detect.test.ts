import { describe, expect, it } from 'vitest';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createRuntimeRegistry } from '../../src/core/runtime/registry.js';
import { detectAllRuntimes, detectCodexRuntime, type RuntimeDoctorReport } from '../../src/core/runtime/detect.js';

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

  it('reports unreadable Codex rollout files in doctor diagnostics', async () => {
    const codexHome = await mkdtemp(path.join(os.tmpdir(), 'agentscope-codex-doctor-'));
    const sessionsRoot = path.join(codexHome, 'sessions');
    const rollout = path.join(sessionsRoot, 'unreadable.jsonl');
    const previousHome = process.env.AGENTSCOPE_CODEX_HOME;
    const previousIndex = process.env.AGENTSCOPE_CODEX_SESSION_INDEX;
    const previousSessions = process.env.AGENTSCOPE_CODEX_SESSIONS_ROOT;

    try {
      await mkdir(sessionsRoot, { recursive: true });
      await writeFile(path.join(codexHome, 'session_index.jsonl'), `${JSON.stringify({
        session_id: 'codex-unreadable',
        rollout_path: 'sessions/unreadable.jsonl',
        repo_path: '/workspace/project',
        path_hint: '/workspace/project',
        timestamp: '2026-04-26T00:00:00.000Z',
      })}\n`);
      await writeFile(rollout, '{}\n');
      await chmod(rollout, 0o000);
      process.env.AGENTSCOPE_CODEX_HOME = codexHome;
      process.env.AGENTSCOPE_CODEX_SESSION_INDEX = path.join(codexHome, 'session_index.jsonl');
      process.env.AGENTSCOPE_CODEX_SESSIONS_ROOT = sessionsRoot;

      const report = await detectCodexRuntime();

      expect(report.stores).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'rollout:unreadable.jsonl', status: 'unreadable' }),
        ]),
      );
      expect(report.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'store_unreadable', runtime: 'codex' }),
        ]),
      );
    } finally {
      await chmod(rollout, 0o600).catch(() => undefined);
      await rm(codexHome, { recursive: true, force: true });
      if (previousHome === undefined) delete process.env.AGENTSCOPE_CODEX_HOME;
      else process.env.AGENTSCOPE_CODEX_HOME = previousHome;
      if (previousIndex === undefined) delete process.env.AGENTSCOPE_CODEX_SESSION_INDEX;
      else process.env.AGENTSCOPE_CODEX_SESSION_INDEX = previousIndex;
      if (previousSessions === undefined) delete process.env.AGENTSCOPE_CODEX_SESSIONS_ROOT;
      else process.env.AGENTSCOPE_CODEX_SESSIONS_ROOT = previousSessions;
    }
  });

  it('warns when the Codex session index has no rollout path entries', async () => {
    const codexHome = await mkdtemp(path.join(os.tmpdir(), 'agentscope-codex-doctor-indexless-'));
    const sessionsRoot = path.join(codexHome, 'sessions');
    const previousHome = process.env.AGENTSCOPE_CODEX_HOME;
    const previousIndex = process.env.AGENTSCOPE_CODEX_SESSION_INDEX;
    const previousSessions = process.env.AGENTSCOPE_CODEX_SESSIONS_ROOT;

    try {
      await mkdir(sessionsRoot, { recursive: true });
      await writeFile(path.join(codexHome, 'session_index.jsonl'), `${JSON.stringify({
        id: '019dbac9-505d-7012-9268-6dec8befadaa',
        thread_name: 'No Man Sky translation',
        updated_at: '2026-04-23T17:58:50.843Z',
      })}\n`);
      process.env.AGENTSCOPE_CODEX_HOME = codexHome;
      process.env.AGENTSCOPE_CODEX_SESSION_INDEX = path.join(codexHome, 'session_index.jsonl');
      process.env.AGENTSCOPE_CODEX_SESSIONS_ROOT = sessionsRoot;

      const report = await detectCodexRuntime();

      expect(report.detected).toBe(true);
      expect(report.path_status).toBe('partial');
      expect(report.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'codex_index_unusable',
            runtime: 'codex',
          }),
        ]),
      );
    } finally {
      await rm(codexHome, { recursive: true, force: true });
      if (previousHome === undefined) delete process.env.AGENTSCOPE_CODEX_HOME;
      else process.env.AGENTSCOPE_CODEX_HOME = previousHome;
      if (previousIndex === undefined) delete process.env.AGENTSCOPE_CODEX_SESSION_INDEX;
      else process.env.AGENTSCOPE_CODEX_SESSION_INDEX = previousIndex;
      if (previousSessions === undefined) delete process.env.AGENTSCOPE_CODEX_SESSIONS_ROOT;
      else process.env.AGENTSCOPE_CODEX_SESSIONS_ROOT = previousSessions;
    }
  });
});

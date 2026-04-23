import { describe, expect, it } from 'vitest';
import { execa } from 'execa';

import { runDoctorCommand } from '../../src/commands/doctor.js';
import type { RuntimeDoctorReport } from '../../src/core/runtime/detect.js';

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

describe('agentscope CLI', () => {
  it('prints doctor help via the CLI entrypoint', async () => {
    const result = await execa('node', ['dist/cli.js', 'doctor', '--help'], {
      reject: false,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('doctor');
  });

  it('renders structured doctor JSON from the shared report contract', async () => {
    const result = await runDoctorCommand({
      json: true,
      detector: async () => [
        makeReport({
          runtime: 'claude',
          detected: true,
          paths: { root: '/fixtures/.claude' },
          stores: [{ name: 'projects', path: '/fixtures/.claude/projects', status: 'present' }],
          sanity: [{ name: 'projects', status: 'ok', message: 'projects readable' }],
        }),
        makeReport({
          runtime: 'codex',
          detected: false,
          paths: { root: '/fixtures/.codex' },
          stores: [{ name: 'sessions', path: '/fixtures/.codex/sessions', status: 'missing' }],
          sanity: [{ name: 'sessions', status: 'warning', message: 'sessions missing' }],
          warnings: [{ code: 'runtime_missing', runtime: 'codex', message: 'Codex runtime not found' }],
        }),
        makeReport({
          runtime: 'opencode',
          detected: true,
          paths: { root: '/fixtures/opencode' },
          stores: [{ name: 'db', path: '/fixtures/opencode/opencode.db', status: 'partial' }],
          sanity: [{ name: 'db', status: 'warning', message: 'db sidecars missing' }],
          warnings: [{ code: 'layout_partial', runtime: 'opencode', message: 'db sidecars missing' }],
        }),
      ],
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed).toHaveProperty('runtimes');
    expect(parsed.runtimes[0]).toHaveProperty('runtime');
    expect(parsed.runtimes[0]).toHaveProperty('detected');
    expect(parsed.runtimes[0]).toHaveProperty('paths');
    expect(parsed.runtimes[0]).toHaveProperty('stores');
    expect(parsed.runtimes[0]).toHaveProperty('sanity');
    expect(parsed.runtimes[0]).toHaveProperty('warnings');
  });

  it('renders compact human doctor output while keeping successful warning-bearing diagnostics at exit 0', async () => {
    const result = await runDoctorCommand({
      json: false,
      detector: async () => [
        makeReport({
          runtime: 'claude',
          detected: true,
          paths: { root: '/fixtures/.claude' },
          stores: [{ name: 'projects', path: '/fixtures/.claude/projects', status: 'present' }],
          sanity: [{ name: 'projects', status: 'ok', message: 'projects readable' }],
        }),
        makeReport({
          runtime: 'codex',
          detected: false,
          paths: { root: '/fixtures/.codex' },
          stores: [{ name: 'sessions', path: '/fixtures/.codex/sessions', status: 'missing' }],
          sanity: [{ name: 'sessions', status: 'warning', message: 'sessions missing' }],
          warnings: [{ code: 'runtime_missing', runtime: 'codex', message: 'Codex runtime not found' }],
        }),
        makeReport({
          runtime: 'opencode',
          detected: true,
          paths: { root: '/fixtures/opencode' },
          stores: [{ name: 'db', path: '/fixtures/opencode/opencode.db', status: 'partial' }],
          sanity: [{ name: 'db', status: 'warning', message: 'db sidecars missing' }],
          warnings: [{ code: 'layout_partial', runtime: 'opencode', message: 'db sidecars missing' }],
        }),
      ],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('[claude]');
    expect(result.stdout).toContain('[codex]');
    expect(result.stdout).toContain('runtime_missing');
    expect(result.stdout).toContain('stores=');
  });

  it('returns non-zero only for internal doctor command failures', async () => {
    const result = await runDoctorCommand({
      json: true,
      detector: async () => {
        throw new Error('doctor exploded');
      },
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('doctor exploded');
  });

  it('prints detected runtimes as JSON through the compiled CLI entrypoint', async () => {
    const result = await execa('node', ['dist/cli.js', 'doctor', '--json'], {
      reject: false,
    });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toHaveProperty('runtimes');
  });
});

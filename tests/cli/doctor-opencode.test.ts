import { describe, expect, it } from 'vitest';
import { execa } from 'execa';

const fixtureEnv = {
  AGENTSCOPE_FIXTURES_MODE: '1',
  AGENTSCOPE_FIXTURES_ROOT: 'fixtures/claude/sample-project',
  AGENTSCOPE_CODEX_FIXTURES_ROOT: 'fixtures/codex',
  AGENTSCOPE_OPENCODE_DB: 'fixtures/opencode/opencode.db',
};

describe('doctor for OpenCode', () => {
  it('reports partial DB layouts as warnings with stable repo/path confidence statuses', async () => {
    const result = await execa('node', ['dist/cli.js', 'doctor', '--json'], {
      reject: false,
      env: {
        ...fixtureEnv,
        AGENTSCOPE_OPENCODE_LAYOUT: 'missing-db',
      },
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    const opencode = parsed.runtimes.find((item: { runtime: string }) => item.runtime === 'opencode');
    expect(opencode.warnings[0].code).toBe('layout_partial');
    expect(['detected', 'inferred', 'unavailable']).toContain(opencode.repo_status);
    expect(['exact', 'partial', 'unavailable']).toContain(opencode.path_status);
  });

  it('keeps human doctor output compact and warning-driven for DB-backed layouts', async () => {
    const result = await execa('node', ['dist/cli.js', 'doctor'], {
      reject: false,
      env: {
        ...fixtureEnv,
        AGENTSCOPE_OPENCODE_LAYOUT: 'partial-tree',
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('[opencode]');
    expect(result.stdout).toContain('layout_partial');
    expect(result.stdout).toContain('repo_status=');
    expect(result.stdout).toContain('path_status=');
  });
});

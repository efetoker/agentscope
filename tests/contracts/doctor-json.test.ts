import { describe, expect, it } from 'vitest';
import { execa } from 'execa';

const fixtureEnv = {
  AGENTSCOPE_FIXTURES_MODE: '1',
  AGENTSCOPE_FIXTURES_ROOT: 'fixtures/claude/sample-project',
  AGENTSCOPE_CODEX_FIXTURES_ROOT: 'fixtures/codex',
  AGENTSCOPE_OPENCODE_DB: 'fixtures/opencode/opencode.db',
};

describe('doctor JSON contract', () => {
  it('returns the pinned runtime-report envelope', async () => {
    const result = await execa('node', ['dist/cli.js', 'doctor', '--json'], {
      reject: false,
      env: fixtureEnv,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(Object.keys(parsed)).toEqual(['runtimes']);
    expect(Array.isArray(parsed.runtimes)).toBe(true);
    expect(parsed.runtimes[0]).toHaveProperty('runtime');
    expect(parsed.runtimes[0]).toHaveProperty('detected');
    expect(parsed.runtimes[0]).toHaveProperty('repo_status');
    expect(parsed.runtimes[0]).toHaveProperty('path_status');
    expect(parsed.runtimes[0]).toHaveProperty('paths');
    expect(parsed.runtimes[0]).toHaveProperty('stores');
    expect(parsed.runtimes[0]).toHaveProperty('sanity');
    expect(parsed.runtimes[0]).toHaveProperty('warnings');
  });
});

import { describe, expect, it } from 'vitest';
import { execa } from 'execa';

const fixtureEnv = {
  AGENTSCOPE_FIXTURES_MODE: '1',
  AGENTSCOPE_FIXTURES_ROOT: 'fixtures/claude/sample-project',
  AGENTSCOPE_CODEX_FIXTURES_ROOT: 'fixtures/codex',
};

describe('cross-runtime search', () => {
  it('returns grouped root results across Claude and Codex', async () => {
    const result = await execa('node', ['dist/cli.js', 'search', 'proxy', '--json'], {
      reject: false,
      env: fixtureEnv,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.results.map((item: { runtime: string }) => item.runtime)).toEqual(
      expect.arrayContaining(['claude', 'codex']),
    );
  });

  it('signals truncation explicitly in JSON output', async () => {
    const result = await execa('node', ['dist/cli.js', 'search', 'proxy', '--json', '--limit', '1'], {
      reject: false,
      env: fixtureEnv,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.truncated).toBe(true);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.warnings.some((warning: { code: string }) => warning.code === 'search_results_truncated')).toBe(true);
  });

  it('preserves available results when one runtime is forced to fail', async () => {
    const result = await execa('node', ['dist/cli.js', 'search', 'proxy', '--json'], {
      reject: false,
      env: {
        ...fixtureEnv,
        AGENTSCOPE_FAIL_RUNTIME: 'codex',
      },
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.results.some((item: { runtime: string }) => item.runtime === 'claude')).toBe(true);
    expect(parsed.results.every((item: { runtime: string }) => item.runtime !== 'codex')).toBe(true);
    expect(parsed.warnings.some((warning: { code: string; runtime?: string }) => warning.code === 'runtime_unavailable' && warning.runtime === 'codex')).toBe(true);
    expect(JSON.stringify(parsed)).not.toContain('/Users/');
  });

  it('preserves available search results when a runtime store is missing', async () => {
    const result = await execa('node', ['dist/cli.js', 'search', 'proxy', '--json'], {
      reject: false,
      env: {
        ...fixtureEnv,
        AGENTSCOPE_OPENCODE_DB: 'fixtures/opencode/missing-opencode.db',
      },
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.results.some((item: { runtime: string }) => item.runtime === 'claude')).toBe(true);
    expect(parsed.results.some((item: { runtime: string }) => item.runtime === 'codex')).toBe(true);
    expect(parsed.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'runtime_unavailable',
          runtime: 'opencode',
          severity: 'warning',
        }),
      ]),
    );
    expect(JSON.stringify(parsed)).not.toContain('/Users/');
  });

  it('fails non-zero when the targeted runtime totally fails', async () => {
    const result = await execa('node', ['dist/cli.js', 'search', '019dab', '--agent', 'codex', '--json'], {
      reject: false,
      env: {
        ...fixtureEnv,
        AGENTSCOPE_FAIL_RUNTIME: 'codex',
      },
    });

    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.error.code).toBe('runtime_unavailable');
  });

  it.each([
    ['--repo', 'definitely-not-a-real-repo'],
    ['--path', 'definitely-not-a-real-path'],
    ['--since', '2999-01-01'],
  ])('does not return unrelated non-Claude results for %s filters', async (flag, value) => {
    const result = await execa('node', ['dist/cli.js', 'search', 'proxy', '--json', flag, value], {
      reject: false,
      env: fixtureEnv,
    });

    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.error.code).toBe('no_matches');
  });

  it.each(['codex', 'opencode'])('passes regex searches through to %s', async (runtime) => {
    const result = await execa('node', ['dist/cli.js', 'search', 'proxy.*ordering', '--agent', runtime, '--json', '--regex'], {
      reject: false,
      env: {
        ...fixtureEnv,
        AGENTSCOPE_OPENCODE_DB: 'fixtures/opencode/opencode.db',
      },
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.results).toEqual([
      expect.objectContaining({ runtime }),
    ]);
    expect(parsed.warnings).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { execa } from 'execa';

const fixtureEnv = {
  AGENTSCOPE_FIXTURES_MODE: '1',
  AGENTSCOPE_FIXTURES_ROOT: 'fixtures/claude/sample-project',
  AGENTSCOPE_CODEX_FIXTURES_ROOT: 'fixtures/codex',
  AGENTSCOPE_OPENCODE_DB: 'fixtures/opencode/opencode.db',
};

describe('truncation regression', () => {
  it('reports truncation explicitly in shell-friendly human output', async () => {
    const result = await execa('node', ['dist/cli.js', 'search', 'proxy', '--limit', '1'], {
      reject: false,
      env: fixtureEnv,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Truncated to 1 root results');
    expect(result.stderr).toContain('search_results_truncated');
  });
});

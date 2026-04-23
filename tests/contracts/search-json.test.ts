import { describe, expect, it } from 'vitest';
import { execa } from 'execa';

const fixtureEnv = {
  AGENTSCOPE_FIXTURES_MODE: '1',
  AGENTSCOPE_FIXTURES_ROOT: 'fixtures/claude/sample-project',
  AGENTSCOPE_CODEX_FIXTURES_ROOT: 'fixtures/codex',
  AGENTSCOPE_OPENCODE_DB: 'fixtures/opencode/opencode.db',
};

describe('search JSON contract', () => {
  it('returns the pinned envelope without leaking raw payloads', async () => {
    const result = await execa('node', ['dist/cli.js', 'search', 'proxy', '--json', '--limit', '1'], {
      reject: false,
      env: fixtureEnv,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(Object.keys(parsed)).toEqual(['query', 'limit', 'truncated', 'results', 'warnings']);
    expect(parsed.truncated).toBe(true);
    expect(Array.isArray(parsed.results)).toBe(true);
    expect(Array.isArray(parsed.warnings)).toBe(true);
    expect(parsed.warnings.some((warning: { code: string }) => warning.code === 'search_results_truncated')).toBe(true);
    expect(JSON.stringify(parsed)).not.toContain('raw proxy output body');
    expect(parsed).not.toHaveProperty('summary');
  });
});

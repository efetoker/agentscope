import { describe, expect, it } from 'vitest';
import { execa } from 'execa';

const fixtureEnv = {
  AGENTSCOPE_FIXTURES_MODE: '1',
  AGENTSCOPE_FIXTURES_ROOT: 'fixtures/claude/sample-project',
  AGENTSCOPE_CODEX_FIXTURES_ROOT: 'fixtures/codex',
  AGENTSCOPE_OPENCODE_DB: 'fixtures/opencode/opencode.db',
};

describe('ambiguous id regression', () => {
  it('returns narrowing hints on stderr for the supported partial-id ambiguity surface', async () => {
    const result = await execa('node', ['dist/cli.js', 'show', '019dab'], {
      reject: false,
      env: fixtureEnv,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('--agent');
    expect(result.stderr).toContain('--path');
    expect(result.stdout).toBe('');
  });
});

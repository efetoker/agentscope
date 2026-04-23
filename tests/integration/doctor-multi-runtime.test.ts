import { describe, expect, it } from 'vitest';
import { execa } from 'execa';

const fixtureEnv = {
  AGENTSCOPE_FIXTURES_MODE: '1',
  AGENTSCOPE_FIXTURES_ROOT: 'fixtures/claude/sample-project',
  AGENTSCOPE_CODEX_FIXTURES_ROOT: 'fixtures/codex',
  AGENTSCOPE_OPENCODE_DB: 'fixtures/opencode/opencode.db',
};

describe('doctor multi-runtime regression', () => {
  it('keeps Claude, Codex, and OpenCode in the runtime inventory', async () => {
    const result = await execa('node', ['dist/cli.js', 'doctor', '--json'], {
      reject: false,
      env: fixtureEnv,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.runtimes.map((item: { runtime: string }) => item.runtime)).toEqual(
      expect.arrayContaining(['claude', 'codex', 'opencode']),
    );
  });

  it('does not regress Claude/Codex doctor behavior when OpenCode layout warnings are present', async () => {
    const result = await execa('node', ['dist/cli.js', 'doctor', '--json'], {
      reject: false,
      env: {
        ...fixtureEnv,
        AGENTSCOPE_OPENCODE_LAYOUT: 'missing-db',
      },
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    const claude = parsed.runtimes.find((item: { runtime: string }) => item.runtime === 'claude');
    const codex = parsed.runtimes.find((item: { runtime: string }) => item.runtime === 'codex');
    expect(claude.detected).toBe(true);
    expect(codex.detected).toBe(true);
  });
});

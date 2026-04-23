import { describe, expect, it } from 'vitest';
import { execa } from 'execa';

const fixtureEnv = {
  AGENTSCOPE_FIXTURES_MODE: '1',
  AGENTSCOPE_FIXTURES_ROOT: 'fixtures/claude/sample-project',
  AGENTSCOPE_CODEX_FIXTURES_ROOT: 'fixtures/codex',
  AGENTSCOPE_OPENCODE_DB: 'fixtures/opencode/opencode.db',
};

describe('show JSON contract', () => {
  it('returns the pinned envelope for a resolved tree bundle', async () => {
    const result = await execa('node', ['dist/cli.js', 'show', 'child-019d', '--json'], {
      reject: false,
      env: fixtureEnv,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(Object.keys(parsed)).toEqual([
      'requested_id',
      'resolved_runtime',
      'resolved_root_session_id',
      'resolution',
      'session_count',
      'bundle_path',
      'manifest_path',
      'warnings',
    ]);
    expect(parsed.resolved_runtime).toBe('codex');
    expect(parsed.resolved_root_session_id).toBe('019dab34-c95a-7bf1-a0f7-817dd7bed87d');
    expect(parsed.session_count).toBe(2);
    expect(parsed.warnings).toEqual([]);
    expect(JSON.stringify(parsed)).not.toContain('raw proxy output body');
  });
});

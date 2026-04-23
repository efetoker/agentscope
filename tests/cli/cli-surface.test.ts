import { describe, expect, it } from 'vitest';
import { execa } from 'execa';

describe('agentscope CLI surface', () => {
  it('lists the frozen MVP commands in top-level help', async () => {
    const result = await execa('node', ['dist/cli.js', '--help'], {
      reject: false,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('search');
    expect(result.stdout).toContain('show');
    expect(result.stdout).toContain('export');
    expect(result.stdout).toContain('doctor');
  });

  it('reports an explicit non-placeholder contract for search before live runtime support is enabled', async () => {
    const result = await execa('node', ['dist/cli.js', 'search', 'foo'], {
      reject: false,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('fixture mode');
  });

  it('reports an explicit non-placeholder contract for show before live runtime support is enabled', async () => {
    const result = await execa('node', ['dist/cli.js', 'show', '123'], {
      reject: false,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('fixture mode');
  });

  it('reports an explicit export contract through the shared CLI entrypoint', async () => {
    const result = await execa('node', ['dist/cli.js', 'export', '123'], {
      reject: false,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Missing required --out directory');
  });
});

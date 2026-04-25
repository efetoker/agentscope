import { describe, expect, it } from 'vitest';
import { execa } from 'execa';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

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

  it('enters live mode by default for search instead of requiring fixture mode', async () => {
    const result = await execa('node', ['dist/cli.js', 'search', 'foo'], {
      reject: false,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Live search is enabled');
    expect(result.stderr).not.toContain('fixture mode');
  });

  it('enters live mode by default for show instead of requiring fixture mode', async () => {
    const result = await execa('node', ['dist/cli.js', 'show', '123'], {
      reject: false,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Live show is enabled');
    expect(result.stderr).not.toContain('fixture mode');
  });

  it('reports an explicit export contract through the shared CLI entrypoint', async () => {
    const result = await execa('node', ['dist/cli.js', 'export', '123'], {
      reject: false,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Missing required --out directory');
  });

  it('enters live mode by default for export instead of requiring fixture mode', async () => {
    const out = await mkdtemp(path.join(tmpdir(), 'agentscope-export-'));
    const result = await execa('node', ['dist/cli.js', 'export', '123', '--out', out], {
      reject: false,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Live export is enabled');
    expect(result.stderr).not.toContain('fixture mode');
  });
});

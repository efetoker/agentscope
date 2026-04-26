import { describe, expect, it } from 'vitest';
import { execa } from 'execa';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function createEmptyClaudeProjectsRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'agentscope-empty-claude-'));
  const projectsDir = path.join(root, '.claude', 'projects');
  await mkdir(projectsDir, { recursive: true });
  return { root, projectsDir };
}

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
    const { root, projectsDir } = await createEmptyClaudeProjectsRoot();
    try {
      const result = await execa('node', ['dist/cli.js', 'search', 'foo', '--agent', 'claude'], {
        reject: false,
        env: { AGENTSCOPE_CLAUDE_PROJECTS_DIR: projectsDir },
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('No matches found');
      expect(result.stderr).not.toContain('fixture mode');
      expect(result.stderr).not.toContain('live session readers are not implemented');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('enters live mode by default for show instead of requiring fixture mode', async () => {
    const { root, projectsDir } = await createEmptyClaudeProjectsRoot();
    try {
      const result = await execa('node', ['dist/cli.js', 'show', '123', '--agent', 'claude'], {
        reject: false,
        env: { AGENTSCOPE_CLAUDE_PROJECTS_DIR: projectsDir },
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Session not found');
      expect(result.stderr).not.toContain('fixture mode');
      expect(result.stderr).not.toContain('live session readers are not implemented');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reports an explicit export contract through the shared CLI entrypoint', async () => {
    const result = await execa('node', ['dist/cli.js', 'export', '123'], {
      reject: false,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Missing required --out directory');
  });

  it('rejects non-positive search limits without stack traces', async () => {
    for (const limit of ['0', '-1']) {
      const result = await execa('node', ['dist/cli.js', 'search', 'foo', '--limit', limit], {
        reject: false,
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('--limit must be greater than 0');
      expect(result.stderr).not.toContain('CACError');
      expect(result.stderr).not.toContain('at ');
    }
  });

  it('rejects invalid search dates cleanly', async () => {
    for (const value of ['garbage', '2026-99-99']) {
      const result = await execa('node', ['dist/cli.js', 'search', 'foo', '--since', value], {
        reject: false,
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('--since must be a valid date');
      expect(result.stderr).not.toContain('at ');
    }
  });

  it('documents accepted search date formats and only exposes --path as the path filter', async () => {
    const result = await execa('node', ['dist/cli.js', 'search', '--help'], {
      reject: false,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('ISO 8601 or YYYY-MM-DD');
    expect(result.stdout).toContain('--path');
    expect(result.stdout).not.toContain('--repo');
  });

  it('enters live mode by default for export instead of requiring fixture mode', async () => {
    const { root, projectsDir } = await createEmptyClaudeProjectsRoot();
    const out = await mkdtemp(path.join(tmpdir(), 'agentscope-export-'));
    try {
      const result = await execa('node', ['dist/cli.js', 'export', '123', '--agent', 'claude', '--out', out], {
        reject: false,
        env: { AGENTSCOPE_CLAUDE_PROJECTS_DIR: projectsDir },
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Session not found');
      expect(result.stderr).not.toContain('fixture mode');
      expect(result.stderr).not.toContain('live session readers are not implemented');
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(out, { recursive: true, force: true });
    }
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execa } from 'execa';

const createdPaths: string[] = [];

const fixtureEnv = {
  AGENTSCOPE_FIXTURES_MODE: '1',
  AGENTSCOPE_FIXTURES_ROOT: 'fixtures/claude/sample-project',
};

afterEach(async () => {
  await Promise.all(
    createdPaths.splice(0).map((targetPath) =>
      rm(targetPath, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

function extractPath(output: string, label: string): string {
  const line = output
    .split('\n')
    .find((candidate) => candidate.startsWith(`${label}: `));

  if (!line) {
    throw new Error(`Missing ${label} in output: ${output}`);
  }

  return line.slice(label.length + 2).trim();
}

describe('Claude fixture-mode CLI commands', () => {
  it('rejects missing and extra search query positionals', async () => {
    const missing = await execa('node', ['dist/cli.js', 'search'], {
      reject: false,
      env: fixtureEnv,
    });
    const extra = await execa('node', ['dist/cli.js', 'search', 'proxy', 'extra'], {
      reject: false,
      env: fixtureEnv,
    });

    expect(missing.exitCode).not.toBe(0);
    expect(extra.exitCode).toBe(1);
    expect(extra.stderr).toContain('Expected exactly one query');
  });

  it('returns grouped search output with bounded previews and no raw payload dump', async () => {
    const result = await execa('node', ['dist/cli.js', 'search', 'proxy'], {
      reject: false,
      env: fixtureEnv,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('[claude]');
    expect(result.stdout).toContain('root=claude-root-1');
    expect(result.stdout).toContain('source=message_text');
    expect(result.stdout).toContain('+ 1 more matches in this tree');
    expect(result.stdout).not.toContain('raw proxy output body');
  });

  it('supports narrowing flags and regex mode in fixture mode', async () => {
    const narrowed = await execa(
      'node',
      [
        'dist/cli.js',
        'search',
        'proxy',
        '--agent',
        'claude',
        '--repo',
        '/fixtures/sample-project',
        '--path',
        '/fixtures/sample-project/src',
        '--here',
        '/fixtures/sample-project/src',
        '--since',
        '2026-04-20T10:03:00Z',
        '--until',
        '2026-04-20T10:04:30Z',
        '--json',
      ],
      {
        reject: false,
        env: fixtureEnv,
      },
    );

    expect(narrowed.exitCode).toBe(0);
    const parsed = JSON.parse(narrowed.stdout);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].rootSessionId).toBe('claude-root-1');

    const regex = await execa('node', ['dist/cli.js', 'search', 'proxy.*middleware', '--regex', '--json'], {
      reject: false,
      env: fixtureEnv,
    });
    expect(regex.exitCode).toBe(0);
    expect(JSON.parse(regex.stdout).results[0].matches[0].nodeSessionId).toBe('claude-child-1');

    const invalidRegex = await execa('node', ['dist/cli.js', 'search', '[', '--regex'], {
      reject: false,
      env: fixtureEnv,
    });
    expect(invalidRegex.exitCode).toBe(1);
    expect(invalidRegex.stderr).toMatch(/regular expression|regex/i);
  });

  it('prints show summaries plus bundle paths without dumping full transcript bodies', async () => {
    const result = await execa('node', ['dist/cli.js', 'show', 'claude-child-1'], {
      reject: false,
      env: fixtureEnv,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Requested ID: claude-child-1');
    expect(result.stdout).toContain('Resolved runtime: claude');
    expect(result.stdout).toContain('Resolved root session ID: claude-root-1');
    expect(result.stdout).toContain('Bundle path:');
    expect(result.stdout).toContain('Manifest path:');
    expect(result.stdout).not.toContain('raw proxy output body');

    const manifestPath = extractPath(result.stdout, 'Manifest path');
    createdPaths.push(path.dirname(manifestPath));

    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    expect(manifest.includedSessionIds).toEqual(['claude-root-1', 'claude-child-1']);
  });

  it('exports into a new bundle directory each time', async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), 'agentscope-export-test-'));
    createdPaths.push(outDir);

    const first = await execa('node', ['dist/cli.js', 'export', 'claude-child-1', '--out', outDir], {
      reject: false,
      env: fixtureEnv,
    });
    const second = await execa('node', ['dist/cli.js', 'export', 'claude-child-1', '--out', outDir], {
      reject: false,
      env: fixtureEnv,
    });

    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(0);

    const firstBundlePath = extractPath(first.stdout, 'Bundle path');
    const secondBundlePath = extractPath(second.stdout, 'Bundle path');

    expect(firstBundlePath).not.toBe(secondBundlePath);

    const manifest = JSON.parse(await readFile(path.join(firstBundlePath, 'manifest.json'), 'utf8'));
    expect(manifest.includedSessionIds).toEqual(['claude-root-1', 'claude-child-1']);
  });
});

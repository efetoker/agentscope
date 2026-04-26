import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

  it('exports into a deterministic bundle directory for equivalent invocations', async () => {
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

    expect(firstBundlePath).toBe(secondBundlePath);

    const manifest = JSON.parse(await readFile(path.join(firstBundlePath, 'manifest.json'), 'utf8'));
    expect(manifest.includedSessionIds).toEqual(['claude-root-1', 'claude-child-1']);
  });
});

async function createLiveClaudeProjectsRoot(options: { includeMalformedLine?: boolean } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agentscope-claude-cli-live-'));
  const projectsDir = path.join(root, '.claude', 'projects');
  const projectDir = path.join(projectsDir, 'project-one');
  await mkdir(projectDir, { recursive: true });
  const lines = [
    JSON.stringify({
      sessionId: 'claude-live-root',
      uuid: 'event-1',
      parentUuid: null,
      timestamp: '2026-04-25T10:00:00.000Z',
      cwd: '/Users/synthetic/project-one',
      type: 'user',
      message: { content: [{ type: 'text', text: 'Investigate middleware behavior' }] },
    }),
  ];

  if (options.includeMalformedLine) {
    lines.push('{not valid json');
  }

  await writeFile(
    path.join(projectDir, 'root-session.jsonl'),
    lines.join('\n'),
  );

  createdPaths.push(root);
  return projectsDir;
}

describe('Claude live-mode CLI commands', () => {
  it('reports no matches when default live search reaches Claude but unsupported runtimes fail', async () => {
    const projectsDir = await createLiveClaudeProjectsRoot();
    const result = await execa('node', ['dist/cli.js', 'search', 'not-present-in-live-store', '--json'], {
      reject: false,
      env: { AGENTSCOPE_CLAUDE_PROJECTS_DIR: projectsDir, AGENTSCOPE_FAIL_RUNTIME: 'opencode' },
    });

    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.error.code).toBe('no_matches');
    expect(parsed.error.message).toBe('No matches found');
  });

  it('searches synthetic live Claude stores without fixture mode', async () => {
    const projectsDir = await createLiveClaudeProjectsRoot();
    const result = await execa('node', ['dist/cli.js', 'search', 'middleware', '--agent', 'claude', '--json'], {
      reject: false,
      env: { AGENTSCOPE_CLAUDE_PROJECTS_DIR: projectsDir },
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.results[0].runtime).toBe('claude');
    expect(parsed.results[0].rootSessionId).toBe('claude-live-root');
  });

  it('shows synthetic live Claude stores without live-reader placeholder', async () => {
    const projectsDir = await createLiveClaudeProjectsRoot();
    const result = await execa('node', ['dist/cli.js', 'show', 'claude-live-root', '--agent', 'claude', '--json'], {
      reject: false,
      env: { AGENTSCOPE_CLAUDE_PROJECTS_DIR: projectsDir },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('live_reader_unimplemented');
    const parsed = JSON.parse(result.stdout);
    expect(parsed.resolved_runtime).toBe('claude');
    createdPaths.push(path.dirname(parsed.manifest_path));
  });

  it('reports session not found when default live show reaches Claude with parser warnings', async () => {
    const projectsDir = await createLiveClaudeProjectsRoot({ includeMalformedLine: true });
    const result = await execa('node', ['dist/cli.js', 'show', 'missing-live-session', '--json'], {
      reject: false,
      env: { AGENTSCOPE_CLAUDE_PROJECTS_DIR: projectsDir },
    });

    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.error.code).toBe('session_not_found');
    expect(parsed.error.message).toBe('Session not found');
  });

  it('exports synthetic live Claude stores', async () => {
    const projectsDir = await createLiveClaudeProjectsRoot();
    const outDir = await mkdtemp(path.join(os.tmpdir(), 'agentscope-claude-live-export-'));
    createdPaths.push(outDir);
    const result = await execa('node', ['dist/cli.js', 'export', 'claude-live-root', '--agent', 'claude', '--out', outDir], {
      reject: false,
      env: { AGENTSCOPE_CLAUDE_PROJECTS_DIR: projectsDir },
    });

    expect(result.exitCode).toBe(0);
    const bundlePath = extractPath(result.stdout, 'Bundle path');
    const manifest = JSON.parse(await readFile(path.join(bundlePath, 'manifest.json'), 'utf8'));
    expect(manifest.runtime).toBe('claude');
    expect(manifest.includedSessionIds).toEqual(['claude-live-root']);
  });

  it('reports session not found when default live export reaches Claude with parser warnings', async () => {
    const projectsDir = await createLiveClaudeProjectsRoot({ includeMalformedLine: true });
    const outDir = await mkdtemp(path.join(os.tmpdir(), 'agentscope-claude-live-export-'));
    createdPaths.push(outDir);
    const result = await execa('node', ['dist/cli.js', 'export', 'missing-live-session', '--out', outDir], {
      reject: false,
      env: { AGENTSCOPE_CLAUDE_PROJECTS_DIR: projectsDir },
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('Session not found');
  });
});

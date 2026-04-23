import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execa } from 'execa';

const fixtureEnv = {
  AGENTSCOPE_FIXTURES_MODE: '1',
  AGENTSCOPE_FIXTURES_ROOT: 'fixtures/claude/sample-project',
  AGENTSCOPE_CODEX_FIXTURES_ROOT: 'fixtures/codex',
};

const createdPaths: string[] = [];

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
  const line = output.split('\n').find((candidate) => candidate.startsWith(`${label}: `));
  if (!line) {
    throw new Error(`Missing ${label} in output: ${output}`);
  }

  return line.slice(label.length + 2).trim();
}

describe('cross-runtime resolution', () => {
  it('resolves exact ids safely and returns structured show JSON', async () => {
    const result = await execa('node', ['dist/cli.js', 'show', 'claude-root-1', '--json'], {
      reject: false,
      env: fixtureEnv,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.resolved_runtime).toBe('claude');
    expect(parsed.resolved_root_session_id).toBe('claude-root-1');
  });

  it('returns structured ambiguity data and narrowing hints for ambiguous partial ids', async () => {
    const jsonResult = await execa('node', ['dist/cli.js', 'show', '019dab', '--json'], {
      reject: false,
      env: fixtureEnv,
    });

    expect(jsonResult.exitCode).toBe(1);
    const parsed = JSON.parse(jsonResult.stdout);
    expect(parsed.error.code).toBe('ambiguous_session_id');
    expect(parsed.error.candidates.length).toBeGreaterThan(1);

    const humanResult = await execa('node', ['dist/cli.js', 'show', '019dab'], {
      reject: false,
      env: fixtureEnv,
    });

    expect(humanResult.exitCode).toBe(1);
    expect(humanResult.stderr).toContain('--agent');
    expect(humanResult.stderr).toContain('Use a longer id');
  });

  it('resolves safe partial ids and preserves whole-tree manifests in show/export', async () => {
    const showResult = await execa('node', ['dist/cli.js', 'show', 'child-019d'], {
      reject: false,
      env: fixtureEnv,
    });

    expect(showResult.exitCode).toBe(0);
    const manifestPath = extractPath(showResult.stdout, 'Manifest path');
    createdPaths.push(path.dirname(manifestPath));
    const showManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    expect(showManifest.includedSessionIds).toEqual([
      '019dab34-c95a-7bf1-a0f7-817dd7bed87d',
      'child-019dab',
    ]);

    const outDir = await mkdtemp(path.join(os.tmpdir(), 'agentscope-cross-runtime-export-'));
    createdPaths.push(outDir);
    const exportResult = await execa('node', ['dist/cli.js', 'export', 'child-019d', '--out', outDir], {
      reject: false,
      env: fixtureEnv,
    });

    expect(exportResult.exitCode).toBe(0);
    const bundlePath = extractPath(exportResult.stdout, 'Bundle path');
    const exportManifest = JSON.parse(await readFile(path.join(bundlePath, 'manifest.json'), 'utf8'));
    expect(exportManifest.includedSessionIds).toEqual([
      '019dab34-c95a-7bf1-a0f7-817dd7bed87d',
      'child-019dab',
    ]);
  });
});

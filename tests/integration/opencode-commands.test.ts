import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execa } from 'execa';

const fixtureEnv = {
  AGENTSCOPE_FIXTURES_MODE: '1',
  AGENTSCOPE_FIXTURES_ROOT: 'fixtures/claude/sample-project',
  AGENTSCOPE_CODEX_FIXTURES_ROOT: 'fixtures/codex',
  AGENTSCOPE_OPENCODE_DB: 'fixtures/opencode/opencode.db',
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

describe('OpenCode command path', () => {
  it('searches OpenCode data through the shared CLI contract', async () => {
    const result = await execa('node', ['dist/cli.js', 'search', 'proxy', '--agent', 'opencode', '--json'], {
      reject: false,
      env: fixtureEnv,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.results[0].runtime).toBe('opencode');
    expect(parsed.results[0].rootSessionId).toBe('oc-root-1');
  });

  it('shows and exports OpenCode trees through the shared CLI contract', async () => {
    const showResult = await execa('node', ['dist/cli.js', 'show', 'oc-child-1', '--agent', 'opencode'], {
      reject: false,
      env: fixtureEnv,
    });

    expect(showResult.exitCode).toBe(0);
    const manifestPath = extractPath(showResult.stdout, 'Manifest path');
    createdPaths.push(path.dirname(manifestPath));
    const showManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    expect(showManifest.includedSessionIds).toEqual(['oc-root-1', 'oc-child-1']);

    const outDir = await mkdtemp(path.join(os.tmpdir(), 'agentscope-opencode-export-'));
    createdPaths.push(outDir);
    const exportResult = await execa('node', ['dist/cli.js', 'export', 'oc-child-1', '--agent', 'opencode', '--out', outDir], {
      reject: false,
      env: fixtureEnv,
    });

    expect(exportResult.exitCode).toBe(0);
    const bundlePath = extractPath(exportResult.stdout, 'Bundle path');
    const exportManifest = JSON.parse(await readFile(path.join(bundlePath, 'manifest.json'), 'utf8'));
    expect(exportManifest.includedSessionIds).toEqual(['oc-root-1', 'oc-child-1']);
  });
});

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
  await Promise.all(createdPaths.splice(0).map((targetPath) => rm(targetPath, { recursive: true, force: true })));
});

function extractPath(output: string, label: string): string {
  const line = output.split('\n').find((candidate) => candidate.startsWith(`${label}: `));
  if (!line) {
    throw new Error(`Missing ${label} in output: ${output}`);
  }

  return line.slice(label.length + 2).trim();
}

describe('contract baseline harness', () => {
  it('pins the search JSON envelope and preview safety contract', async () => {
    const result = await execa('node', ['dist/cli.js', 'search', 'proxy', '--json', '--limit', '1'], {
      reject: false,
      env: fixtureEnv,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(Object.keys(parsed)).toEqual(['query', 'limit', 'truncated', 'results', 'warnings']);
    expect(parsed.query).toBe('proxy');
    expect(parsed.limit).toBe(1);
    expect(parsed.truncated).toBe(true);
    expect(parsed.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'search_results_truncated',
          severity: 'warning',
        }),
      ]),
    );
    expect(JSON.stringify(parsed)).not.toContain('raw proxy output body');
  });

  it('pins the show JSON envelope and ambiguity contract', async () => {
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
      'project_path',
      'started_at',
      'session_ids',
      'bundle_path',
      'manifest_path',
      'warnings',
    ]);
    expect(parsed).toMatchObject({
      requested_id: 'child-019d',
      resolved_runtime: 'codex',
      resolved_root_session_id: '019dab34-c95a-7bf1-a0f7-817dd7bed87d',
      resolution: 'partial',
      session_count: 2,
      project_path: expect.any(String),
      started_at: expect.any(String),
      session_ids: expect.arrayContaining(['child-019dab']),
      warnings: [],
    });

    createdPaths.push(path.dirname(parsed.manifest_path));

    const ambiguous = await execa('node', ['dist/cli.js', 'show', '019dab', '--json'], {
      reject: false,
      env: fixtureEnv,
    });

    expect(ambiguous.exitCode).toBe(1);
    const ambiguity = JSON.parse(ambiguous.stdout);
    expect(ambiguity.error.code).toBe('ambiguous_session_id');
    expect(ambiguity.error.candidates.length).toBeGreaterThan(1);
    expect(ambiguity.error.candidates[0]).toEqual(
      expect.objectContaining({
        runtime: expect.any(String),
        sessionId: expect.any(String),
        rootSessionId: expect.any(String),
        repoPath: expect.any(String),
        pathHint: expect.any(String),
        timestamp: expect.any(String),
      }),
    );
  });

  it('pins export manifest provenance without unsafe payload leakage', async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), 'agentscope-contract-export-'));
    createdPaths.push(outDir);

    const result = await execa('node', ['dist/cli.js', 'export', 'child-019d', '--out', outDir], {
      reject: false,
      env: fixtureEnv,
    });

    expect(result.exitCode).toBe(0);
    const bundlePath = extractPath(result.stdout, 'Bundle path');
    const manifest = JSON.parse(await readFile(path.join(bundlePath, 'manifest.json'), 'utf8'));

    expect(manifest).toEqual(
      expect.objectContaining({
        runtime: 'codex',
        requestedId: 'child-019dab',
        resolvedRootSessionId: '019dab34-c95a-7bf1-a0f7-817dd7bed87d',
        includedSessionIds: ['019dab34-c95a-7bf1-a0f7-817dd7bed87d', 'child-019dab'],
        queriedSources: ['fixtures/codex/session_index.jsonl'],
        payloadFiles: ['rollout-root.jsonl', 'rollout-child.jsonl'],
        warnings: [],
      }),
    );
    expect(manifest.generatedAt).toEqual(expect.any(String));
    expect(Date.parse(manifest.generatedAt)).not.toBeNaN();
    expect(JSON.stringify(manifest)).not.toContain('raw proxy output body');
    expect(JSON.stringify(manifest)).not.toContain('/Users/');
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { runExportCommand } from '../../src/commands/export.js';
import { runSearchCommand } from '../../src/commands/search.js';
import { runShowCommand } from '../../src/commands/show.js';

const createdPaths: string[] = [];

afterEach(async () => {
  await Promise.all(createdPaths.splice(0).map((target) => rm(target, { recursive: true, force: true })));
});

async function createCodexHome(): Promise<string> {
  const codexHome = await mkdtemp(path.join(os.tmpdir(), 'agentscope-codex-command-'));
  createdPaths.push(codexHome);
  await mkdir(path.join(codexHome, 'sessions'), { recursive: true });
  await writeFile(
    path.join(codexHome, 'session_index.jsonl'),
    `${JSON.stringify({
      session_id: 'codex-root-1',
      root_session_id: 'codex-root-1',
      parent_session_id: null,
      rollout_path: 'sessions/rollout-root.jsonl',
      repo_path: '/workspace/project',
      path_hint: '/workspace/project',
      timestamp: '2026-04-26T00:00:00.000Z',
    })}\n`,
  );
  await writeFile(
    path.join(codexHome, 'sessions', 'rollout-root.jsonl'),
    `${JSON.stringify({
      type: 'event_msg',
      session_id: 'codex-root-1',
      root_session_id: 'codex-root-1',
      timestamp: '2026-04-26T00:00:01.000Z',
      message: { role: 'user', content: 'codex live adapter' },
    })}\n`,
  );
  return codexHome;
}

async function addRepeatedUnreadableCodexRollouts(codexHome: string) {
  await writeFile(
    path.join(codexHome, 'session_index.jsonl'),
    `${JSON.stringify({
      session_id: 'codex-root-1',
      root_session_id: 'codex-root-1',
      parent_session_id: null,
      rollout_path: 'sessions/rollout-root.jsonl',
      repo_path: '/workspace/project',
      path_hint: '/workspace/project',
      timestamp: '2026-04-26T00:00:00.000Z',
    })}\n${JSON.stringify({
      session_id: 'codex-missing-1',
      root_session_id: 'codex-missing-1',
      parent_session_id: null,
      rollout_path: 'sessions/missing.jsonl',
      repo_path: '/workspace/project',
      path_hint: '/workspace/project',
      timestamp: '2026-04-26T00:01:00.000Z',
    })}\n${JSON.stringify({
      session_id: 'codex-missing-2',
      root_session_id: 'codex-missing-2',
      parent_session_id: null,
      rollout_path: 'sessions/missing.jsonl',
      repo_path: '/workspace/project',
      path_hint: '/workspace/project',
      timestamp: '2026-04-26T00:02:00.000Z',
    })}\n`,
  );
}

function codexEnv(codexHome: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    AGENTSCOPE_CODEX_HOME: codexHome,
    AGENTSCOPE_CODEX_SESSION_INDEX: path.join(codexHome, 'session_index.jsonl'),
    AGENTSCOPE_CODEX_SESSIONS_ROOT: path.join(codexHome, 'sessions'),
    AGENTSCOPE_FAIL_RUNTIME: 'claude,opencode',
  };
}

describe('Codex live commands', () => {
  it('searches live Codex stores without fixture mode', async () => {
    const codexHome = await createCodexHome();

    const result = await runSearchCommand({
      query: 'codex live adapter',
      rawArgs: ['codex live adapter'],
      agent: 'codex',
      json: true,
      env: codexEnv(codexHome),
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.results[0].runtime).toBe('codex');
  });

  it('writes human warnings to stderr and deduplicates repeated Codex warning spam', async () => {
    const codexHome = await createCodexHome();
    await addRepeatedUnreadableCodexRollouts(codexHome);

    const result = await runSearchCommand({
      query: 'codex live adapter',
      rawArgs: ['codex live adapter'],
      agent: 'codex',
      env: codexEnv(codexHome),
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Results:');
    expect(result.stdout).not.toContain('Warnings:');
    const unreadableMatches = result.stderr.match(/codex_rollout_unreadable/g) ?? [];
    expect(unreadableMatches).toHaveLength(1);
  });

  it('shows live Codex sessions without fixture mode', async () => {
    const codexHome = await createCodexHome();

    const result = await runShowCommand({
      id: 'codex-root-1',
      rawArgs: ['codex-root-1'],
      agent: 'codex',
      json: true,
      env: codexEnv(codexHome),
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.resolved_runtime).toBe('codex');
    expect(parsed.resolved_root_session_id).toBe('codex-root-1');
    expect(parsed.project_path).toBe('/workspace/project');
    expect(parsed.started_at).toBe('2026-04-26T00:00:00.000Z');
    expect(parsed.session_ids).toEqual(['codex-root-1']);
  });

  it('exports live Codex bundles without fixture mode', async () => {
    const codexHome = await createCodexHome();
    const out = await mkdtemp(path.join(os.tmpdir(), 'agentscope-codex-export-'));
    createdPaths.push(out);

    const result = await runExportCommand({
      id: 'codex-root-1',
      rawArgs: ['codex-root-1'],
      agent: 'codex',
      out,
      env: codexEnv(codexHome),
    });

    expect(result.exitCode).toBe(0);
    const bundlePath = result.stdout
      .split('\n')
      .find((line) => line.startsWith('Bundle path: '))
      ?.slice('Bundle path: '.length);
    expect(bundlePath).toBeTruthy();
    const manifest = JSON.parse(await readFile(path.join(bundlePath!, 'manifest.json'), 'utf8'));
    expect(manifest.runtime).toBe('codex');
    expect(manifest.includedSessionIds).toEqual(['codex-root-1']);

    const secondResult = await runExportCommand({
      id: 'codex-root-1',
      rawArgs: ['codex-root-1'],
      agent: 'codex',
      out,
      env: codexEnv(codexHome),
    });
    const secondBundlePath = secondResult.stdout
      .split('\n')
      .find((line) => line.startsWith('Bundle path: '))
      ?.slice('Bundle path: '.length);
    expect(secondBundlePath).toBe(bundlePath);
  });
});

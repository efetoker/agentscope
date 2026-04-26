import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expandCodexTree, loadCodexSessionsWithWarnings } from '../../../src/runtimes/codex/tree.js';

const createdPaths: string[] = [];

afterEach(async () => {
  await Promise.all(createdPaths.splice(0).map((target) => rm(target, { recursive: true, force: true })));
});

async function createCodexHome(options: { malformed?: boolean; uncertainLinkage?: boolean } = {}): Promise<string> {
  const codexHome = await mkdtemp(path.join(os.tmpdir(), 'agentscope-codex-live-'));
  createdPaths.push(codexHome);
  const rolloutDir = path.join(codexHome, 'sessions', '2026', '04');
  await mkdir(rolloutDir, { recursive: true });

  const sessionId = options.uncertainLinkage ? 'codex-uncertain-1' : 'codex-root-1';
  const indexRow = options.uncertainLinkage
    ? {
        session_id: sessionId,
        rollout_path: 'sessions/2026/04/rollout-root.jsonl',
        repo_path: '/workspace/project',
        path_hint: '/workspace/project',
        timestamp: '2026-04-26T00:00:00.000Z',
      }
    : {
        session_id: sessionId,
        root_session_id: sessionId,
        parent_session_id: null,
        rollout_path: 'sessions/2026/04/rollout-root.jsonl',
        repo_path: '/workspace/project',
        path_hint: '/workspace/project',
        timestamp: '2026-04-26T00:00:00.000Z',
      };

  await writeFile(path.join(codexHome, 'session_index.jsonl'), `${JSON.stringify(indexRow)}\n`);

  const rolloutLines = [
    {
      type: 'session_meta',
      session_id: sessionId,
      ...(options.uncertainLinkage ? {} : { root_session_id: sessionId }),
      timestamp: '2026-04-26T00:00:00.000Z',
      repo_path: '/workspace/project',
      path_hint: '/workspace/project',
    },
    {
      type: 'turn_context',
      session_id: sessionId,
      ...(options.uncertainLinkage ? {} : { root_session_id: sessionId }),
      timestamp: '2026-04-26T00:00:01.000Z',
      cwd: '/workspace/project',
    },
    {
      type: 'event_msg',
      session_id: sessionId,
      ...(options.uncertainLinkage ? {} : { root_session_id: sessionId }),
      timestamp: '2026-04-26T00:00:02.000Z',
      message: { role: 'user', content: 'please build codex live adapter' },
    },
    {
      type: 'response_item',
      session_id: sessionId,
      ...(options.uncertainLinkage ? {} : { root_session_id: sessionId }),
      timestamp: '2026-04-26T00:00:03.000Z',
      item: { type: 'message', content: [{ type: 'output_text', text: 'codex live adapter response' }] },
      usage: { input_tokens: 12, output_tokens: 34 },
    },
  ];

  await writeFile(
    path.join(codexHome, 'sessions', '2026', '04', 'rollout-root.jsonl'),
    `${rolloutLines.map((line) => JSON.stringify(line)).join('\n')}${options.malformed ? '\nnot-json' : ''}\n`,
  );

  return codexHome;
}

describe('Codex tree expansion', () => {
  it('expands a child thread to the whole root tree', async () => {
    const tree = await expandCodexTree({
      sessionId: 'child-019dab',
      fixturesRoot: 'fixtures/codex',
    });

    expect(tree.rootSessionId).toBe('019dab34-c95a-7bf1-a0f7-817dd7bed87d');
    expect(tree.sessionIds).toContain('019dab34-c95a-7bf1-a0f7-817dd7bed87d');
    expect(tree.sessionIds).toContain('child-019dab');
  });

  it('loads live Codex index and rollout records with warnings', async () => {
    const codexHome = await createCodexHome();

    const result = await loadCodexSessionsWithWarnings({ liveCodexHome: codexHome });

    expect(result.warnings).toEqual([]);
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].sessionId).toBe('codex-root-1');
    expect(result.sessions[0].rootSessionId).toBe('codex-root-1');
    expect(result.sessions[0].events.map((event) => event.rawType)).toEqual([
      'session_meta',
      'turn_context',
      'event_msg',
      'response_item',
    ]);
  });

  it('warns and keeps valid rollout records when a live JSONL line is malformed', async () => {
    const codexHome = await createCodexHome({ malformed: true });

    const result = await loadCodexSessionsWithWarnings({ liveCodexHome: codexHome });

    expect(result.sessions[0].events.length).toBeGreaterThan(0);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'codex_jsonl_malformed',
          runtime: 'codex',
        }),
      ]),
    );
  });

  it('uses conservative linkage when durable Codex root metadata is missing', async () => {
    const codexHome = await createCodexHome({ uncertainLinkage: true });

    const result = await loadCodexSessionsWithWarnings({ liveCodexHome: codexHome });

    expect(result.sessions[0].rootSessionId).toBe('codex-uncertain-1');
    expect(result.sessions[0].linkageConfidence).toBe('unknown');
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'codex_linkage_uncertain',
          runtime: 'codex',
        }),
      ]),
    );
  });

  it('falls back to recursive rollout discovery when the live index has no rollout paths', async () => {
    const codexHome = await mkdtemp(path.join(os.tmpdir(), 'agentscope-codex-indexless-'));
    createdPaths.push(codexHome);
    const rolloutDir = path.join(codexHome, 'sessions', '2026', '04', '23');
    await mkdir(rolloutDir, { recursive: true });

    await writeFile(
      path.join(codexHome, 'session_index.jsonl'),
      `${JSON.stringify({
        id: '019dbac9-505d-7012-9268-6dec8befadaa',
        thread_name: 'No Man Sky translation',
        updated_at: '2026-04-23T17:58:50.843Z',
      })}\n`,
    );

    await writeFile(
      path.join(rolloutDir, 'rollout-2026-04-23T17-40-48-019dbac9-505d-7012-9268-6dec8befadaa.jsonl'),
      [
        {
          timestamp: '2026-04-23T14:41:28.130Z',
          type: 'session_meta',
          payload: {
            id: '019dbac9-505d-7012-9268-6dec8befadaa',
            timestamp: '2026-04-23T14:40:48.766Z',
            cwd: '/workspace/project',
          },
        },
        {
          timestamp: '2026-04-23T14:42:14.390Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: 'Long No Mans Sky reddit guide translated to Turkish',
              },
            ],
          },
        },
      ].map((line) => JSON.stringify(line)).join('\n') + '\n',
    );

    const result = await loadCodexSessionsWithWarnings({ liveCodexHome: codexHome });
    const discovered = result.sessions.find((session) => session.sessionId === '019dbac9-505d-7012-9268-6dec8befadaa');

    expect(discovered).toBeDefined();
    expect(discovered?.pathHint).toBe('/workspace/project');
    expect(discovered?.events.every((event) => event.session_id === '019dbac9-505d-7012-9268-6dec8befadaa')).toBe(true);
    expect(discovered?.events.map((event) => event.event.text).join('\n')).toContain('No Mans Sky reddit guide');
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'codex_index_unusable',
          runtime: 'codex',
        }),
      ]),
    );
    expect(result.warnings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'codex_rollout_unreadable' }),
        expect.objectContaining({ code: 'codex_rollout_missing' }),
      ]),
    );
  });
});

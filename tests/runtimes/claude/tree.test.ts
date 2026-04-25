import { describe, expect, it } from 'vitest';
import { chmod, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expandClaudeTree, loadClaudeSessionsWithWarnings } from '../../../src/runtimes/claude/tree.js';

async function createLiveClaudeProjectsRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agentscope-claude-live-'));
  const projectsDir = path.join(root, '.claude', 'projects');
  const projectDir = path.join(projectsDir, 'project-one');
  await mkdir(projectDir, { recursive: true });
  await writeFile(
    path.join(projectDir, 'root-session.jsonl'),
    [
      JSON.stringify({
        sessionId: 'claude-live-root',
        uuid: 'event-1',
        parentUuid: null,
        timestamp: '2026-04-25T10:00:00.000Z',
        cwd: '/Users/synthetic/project-one',
        type: 'user',
        message: { content: [{ type: 'text', text: 'Investigate middleware behavior' }] },
      }),
      '{not-json',
      JSON.stringify({
        sessionId: 'claude-live-root',
        uuid: 'event-2',
        parentUuid: 'event-1',
        timestamp: '2026-04-25T10:01:00.000Z',
        cwd: '/Users/synthetic/project-one',
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name: 'Read', input: { file: 'middleware.ts' } }] },
      }),
    ].join('\n'),
  );

  return { root, projectsDir };
}

describe('Claude tree expansion', () => {
  it('expands a child session to the full root tree', async () => {
    const tree = await expandClaudeTree({
      sessionId: 'claude-child-1',
      fixturesRoot: 'fixtures/claude/sample-project',
    });

    expect(tree.rootSessionId).toBe('claude-root-1');
    expect(tree.sessionIds).toContain('claude-root-1');
    expect(tree.sessionIds).toContain('claude-child-1');
  });

  it('loads live project JSONL sessions and reports malformed lines', async () => {
    const { root, projectsDir } = await createLiveClaudeProjectsRoot();
    try {
      const result = await loadClaudeSessionsWithWarnings({ liveProjectsRoot: projectsDir });

      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0].sessionId).toBe('claude-live-root');
      expect(result.sessions[0].events.some((event) => event.uuid === 'event-1')).toBe(true);
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'claude_jsonl_malformed', runtime: 'claude', severity: 'warning' }),
        ]),
      );
      expect(JSON.stringify(result.warnings)).not.toContain('{not-json');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('links live subagent JSONL sessions to their parent session tree', async () => {
    const { root, projectsDir } = await createLiveClaudeProjectsRoot();
    const projectDir = path.join(projectsDir, 'project-one');
    const subagentsDir = path.join(projectDir, 'subagents');

    try {
      await mkdir(subagentsDir, { recursive: true });
      await writeFile(
        path.join(subagentsDir, 'agent-1.jsonl'),
        JSON.stringify({
          sessionId: 'claude-subagent-1',
          uuid: 'subagent-event-1',
          parentUuid: null,
          timestamp: '2026-04-25T10:02:00.000Z',
          cwd: '/Users/synthetic/project-one',
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Subagent finding' }] },
        }),
      );

      const tree = await expandClaudeTree({ sessionId: 'claude-live-root', liveProjectsRoot: projectsDir });

      expect(tree.sessionIds).toContain('claude-live-root');
      expect(tree.sessionIds).toContain('claude-subagent-1');
      expect(tree.sessions.find((session) => session.sessionId === 'claude-subagent-1')?.parentSessionId).toBe('claude-live-root');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps readable live sessions when one JSONL file cannot be read', async () => {
    const { root, projectsDir } = await createLiveClaudeProjectsRoot();
    const unreadablePath = path.join(projectsDir, 'project-one', 'unreadable.jsonl');

    try {
      await writeFile(unreadablePath, JSON.stringify({ sessionId: 'unreadable-session' }));
      await chmod(unreadablePath, 0o000);

      const result = await loadClaudeSessionsWithWarnings({ liveProjectsRoot: projectsDir });

      expect(result.sessions.map((session) => session.sessionId)).toContain('claude-live-root');
      expect(result.sessions.map((session) => session.sessionId)).not.toContain('unreadable-session');
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'claude_jsonl_unreadable', runtime: 'claude', severity: 'warning' }),
        ]),
      );
      expect(JSON.stringify(result.warnings)).not.toContain(unreadablePath);
    } finally {
      await chmod(unreadablePath, 0o600).catch(() => undefined);
      await rm(root, { recursive: true, force: true });
    }
  });
});

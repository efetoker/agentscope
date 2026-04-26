import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { MaterializeBundleInput } from '../../core/bundle/manifest.js';
import { expandCodexTree } from './tree.js';

export interface CodexExportInput {
  sessionId: string;
  fixturesRoot?: string;
  liveCodexHome?: string;
  sessionIndexJsonl?: string;
  sessionsRoot?: string;
  historyJsonl?: string;
  archivedSessionsRoot?: string;
}

export async function prepareCodexBundle(input: CodexExportInput): Promise<MaterializeBundleInput> {
  const { sessionId, ...treeInput } = input;
  const tree = await expandCodexTree({
    sessionId,
    ...treeInput,
  });

  const payloadFiles = await Promise.all(
    tree.sessions.map(async (session) => ({
      relativePath: path.basename(session.rolloutPath),
      content: await readFile(session.sourcePath ?? path.join(input.fixturesRoot ?? '', session.rolloutPath), 'utf8'),
    })),
  );

  return {
    runtime: 'codex',
    requestedId: input.sessionId,
    resolvedRootSessionId: tree.rootSessionId,
    includedSessionIds: tree.sessionIds,
    queriedSources: [input.sessionIndexJsonl ?? (input.fixturesRoot ? path.join(input.fixturesRoot, 'session_index.jsonl') : 'session_index.jsonl')],
    payloadFiles,
    warnings: tree.warnings ?? [],
    repo: {
      value: tree.sessions[0]?.repoPath,
      status: 'detected',
    },
    path: {
      value: tree.sessions[0]?.pathHint,
      status: 'exact',
    },
  };
}

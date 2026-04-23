import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { MaterializeBundleInput } from '../../core/bundle/manifest.js';
import { expandClaudeTree } from './tree.js';

export interface ClaudeExportInput {
  sessionId: string;
  fixturesRoot: string;
}

export async function prepareClaudeBundle(input: ClaudeExportInput): Promise<MaterializeBundleInput> {
  const tree = await expandClaudeTree({
    sessionId: input.sessionId,
    fixturesRoot: input.fixturesRoot,
  });

  const payloadFiles = await Promise.all(
    tree.sessions.map(async (session) => ({
      relativePath: path.basename(session.sourcePath),
      content: await readFile(session.sourcePath, 'utf8'),
    })),
  );

  return {
    runtime: 'claude',
    requestedId: input.sessionId,
    resolvedRootSessionId: tree.rootSessionId,
    includedSessionIds: tree.sessionIds,
    queriedSources: [input.fixturesRoot],
    payloadFiles,
    warnings: [],
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

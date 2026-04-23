import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { MaterializeBundleInput } from '../../core/bundle/manifest.js';
import { expandCodexTree } from './tree.js';

export interface CodexExportInput {
  sessionId: string;
  fixturesRoot: string;
}

export async function prepareCodexBundle(input: CodexExportInput): Promise<MaterializeBundleInput> {
  const tree = await expandCodexTree({
    sessionId: input.sessionId,
    fixturesRoot: input.fixturesRoot,
  });

  const payloadFiles = await Promise.all(
    tree.sessions.map(async (session) => ({
      relativePath: path.basename(session.rolloutPath),
      content: await readFile(path.join(input.fixturesRoot, session.rolloutPath), 'utf8'),
    })),
  );

  return {
    runtime: 'codex',
    requestedId: input.sessionId,
    resolvedRootSessionId: tree.rootSessionId,
    includedSessionIds: tree.sessionIds,
    queriedSources: [path.join(input.fixturesRoot, 'session_index.jsonl')],
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

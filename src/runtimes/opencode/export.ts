import type { MaterializeBundleInput } from '../../core/bundle/manifest.js';
import { expandOpenCodeTree } from './tree.js';

export interface OpenCodeExportInput {
  sessionId: string;
  fixtureDb: string;
}

export async function prepareOpenCodeBundle(input: OpenCodeExportInput): Promise<MaterializeBundleInput> {
  const tree = await expandOpenCodeTree({
    sessionId: input.sessionId,
    fixtureDb: input.fixtureDb,
  });

  return {
    runtime: 'opencode',
    requestedId: input.sessionId,
    resolvedRootSessionId: tree.rootSessionId,
    includedSessionIds: tree.sessionIds,
    queriedSources: [input.fixtureDb],
    payloadFiles: [
      {
        relativePath: 'opencode-tree.json',
        content: JSON.stringify(tree, null, 2),
      },
    ],
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

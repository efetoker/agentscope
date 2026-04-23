import { afterEach, describe, expect, it } from 'vitest';
import { rm } from 'node:fs/promises';

import { materializeTempBundle } from '../../src/core/bundle/materialize.js';
import { formatSearchResultsHuman } from '../../src/core/output/human.js';
import { formatSearchResultsJson } from '../../src/core/output/json.js';
import type { BundleManifest } from '../../src/core/bundle/manifest.js';
import type { SearchResultsEnvelope } from '../../src/core/types.js';

const createdPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdPaths.splice(0).map((path) =>
      rm(path, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

describe('core contract stability', () => {
  it('keeps warnings stable across human output, JSON output, and manifests', async () => {
    const warnings = [
      {
        code: 'repo_root_inferred',
        runtime: 'claude',
        message: 'repo inferred from cwd',
        severity: 'warning' as const,
      },
    ];

    const results: SearchResultsEnvelope = {
      query: 'proxy',
      limit: 20,
      truncated: false,
      results: [
        {
          runtime: 'claude',
          rootSessionId: 'root-1',
          hiddenMatchCount: 2,
          matches: [
            { nodeSessionId: 'root-1', source: 'message_text', preview: 'proxy config' },
            { nodeSessionId: 'child-1', source: 'message_text', preview: 'proxy retry' },
            { nodeSessionId: 'child-2', source: 'error', preview: 'proxy failed' },
            { nodeSessionId: 'child-3', source: 'metadata' },
            { nodeSessionId: 'child-4', source: 'tool_result', preview: 'multiple payload body' },
          ],
        },
      ],
      warnings,
    };

    const humanOutput = formatSearchResultsHuman(results);
    const jsonOutput = formatSearchResultsJson(results);
    const manifestBundle = await materializeTempBundle({
      runtime: 'claude',
      requestedId: 'abc123',
      resolvedRootSessionId: 'root-1',
      queriedSources: [],
      payloadFiles: [
        { relativePath: 'root.jsonl', content: '{"type":"session_meta"}\n' },
        { relativePath: 'children/child-1.jsonl', content: '{"type":"message"}\n' },
      ],
      warnings,
    });

    createdPaths.push(manifestBundle.path);

    expect(humanOutput).toContain('repo_root_inferred');
    expect(humanOutput).toContain('+ 2 more matches in this tree');
    expect(humanOutput).not.toContain('multiple payload body');

    expect(jsonOutput.warnings).toEqual(warnings);
    expect(jsonOutput.results[0]).toMatchObject({
      runtime: 'claude',
      rootSessionId: 'root-1',
      hiddenMatchCount: 2,
    });

    const manifest: BundleManifest = manifestBundle.manifest;
    expect(manifest.warnings).toEqual(warnings);
    expect(manifest.payloadFiles).toEqual(['root.jsonl', 'children/child-1.jsonl']);
    expect(manifest.queriedSources).toEqual([]);
    expect(manifest.includedSessionIds).toEqual(['root-1']);
    expect('transcript' in manifest).toBe(false);
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { readFile, rm } from 'node:fs/promises';
import os from 'node:os';

import { materializeTempBundle } from '../../src/core/bundle/materialize.js';

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

describe('bundle materialization', () => {
  it('creates a unique temp bundle with a manifest and payload files', async () => {
    const first = await materializeTempBundle({
      runtime: 'claude',
      requestedId: 'abc123',
      resolvedRootSessionId: 'root-1',
      payloadFiles: [
        { relativePath: 'root.jsonl', content: '{"type":"session_meta"}\n' },
        { relativePath: 'child/child.jsonl', content: '{"type":"message"}\n' },
      ],
      warnings: [],
    });

    const second = await materializeTempBundle({
      runtime: 'claude',
      requestedId: 'abc123',
      resolvedRootSessionId: 'root-1',
      payloadFiles: [{ relativePath: 'root.jsonl', content: '{"type":"session_meta"}\n' }],
      warnings: [],
    });

    createdPaths.push(first.path, second.path);

    expect(first.path.startsWith(os.tmpdir())).toBe(true);
    expect(first.manifestPath.endsWith('manifest.json')).toBe(true);
    expect(first.path).not.toBe(second.path);

    const manifest = JSON.parse(await readFile(first.manifestPath, 'utf8'));
    expect(manifest.runtime).toBe('claude');
    expect(manifest.resolvedRootSessionId).toBe('root-1');
    expect(manifest.payloadFiles).toEqual([
      'root.jsonl',
      'child/child.jsonl',
    ]);
    expect(manifest.queriedSources).toEqual([]);
  });
});

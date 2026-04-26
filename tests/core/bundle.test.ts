import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { materializeBundleInDirectory, materializeTempBundle } from '../../src/core/bundle/materialize.js';

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

  it('rejects payload paths that can escape the bundle directory', async () => {
    await expect(
      materializeTempBundle({
        runtime: 'claude',
        requestedId: 'abc123',
        resolvedRootSessionId: 'root-1',
        payloadFiles: [{ relativePath: '../escape.jsonl', content: '{}' }],
        warnings: [],
      }),
    ).rejects.toThrow('Unsafe bundle payload path: ../escape.jsonl');

    await expect(
      materializeTempBundle({
        runtime: 'claude',
        requestedId: 'abc123',
        resolvedRootSessionId: 'root-1',
        payloadFiles: [{ relativePath: '/tmp/escape.jsonl', content: '{}' }],
        warnings: [],
      }),
    ).rejects.toThrow('Unsafe bundle payload path: /tmp/escape.jsonl');
  });

  it('rejects unsafe payload paths before creating a bundle directory', async () => {
    const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'agentscope-bundle-test-'));
    createdPaths.push(outputRoot);

    await expect(
      materializeBundleInDirectory(
        {
          runtime: 'claude',
          requestedId: 'abc123',
          resolvedRootSessionId: 'root-1',
          payloadFiles: [{ relativePath: '../escape.jsonl', content: '{}' }],
          warnings: [],
        },
        outputRoot,
      ),
    ).rejects.toThrow('Unsafe bundle payload path: ../escape.jsonl');

    expect(await readdir(outputRoot)).toEqual([]);
  });

  it('redacts manifest path metadata and keeps restrictive file permissions', async () => {
    const bundle = await materializeTempBundle({
      runtime: 'claude',
      requestedId: 'abc123',
      resolvedRootSessionId: 'root-1',
      payloadFiles: [{ relativePath: 'root.jsonl', content: '{"type":"session_meta"}\n' }],
      warnings: [],
      repo: { value: '/Users/alex/project', status: 'detected' },
      path: { value: '/home/sam/project/src', status: 'exact' },
    });

    createdPaths.push(bundle.path);

    expect(bundle.manifest.repo?.value).toBe('/Users/[redacted-user]/project');
    expect(bundle.manifest.path?.value).toBe('/home/[redacted-user]/project/src');
    expect(JSON.stringify(bundle.manifest)).not.toContain('/Users/alex');
    expect(JSON.stringify(bundle.manifest)).not.toContain('/home/sam');

    if (process.platform !== 'win32') {
      expect((await stat(bundle.path)).mode & 0o777).toBe(0o700);
      expect((await stat(bundle.manifestPath)).mode & 0o777).toBe(0o600);
    }
  });
});

import { chmod, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { BundleManifest, MaterializeBundleInput } from './manifest.js';

export interface MaterializedBundle {
  path: string;
  manifestPath: string;
  manifest: BundleManifest;
}

async function materializeBundle(input: MaterializeBundleInput, parentDir: string): Promise<MaterializedBundle> {
  await mkdir(parentDir, { recursive: true });
  const bundlePath = await mkdtemp(path.join(parentDir, `agentscope-${input.runtime}-`));
  await chmod(bundlePath, 0o700).catch(() => undefined);

  const manifest: BundleManifest = {
    runtime: input.runtime,
    requestedId: input.requestedId,
    requestedQuery: input.requestedQuery,
    resolvedRootSessionId: input.resolvedRootSessionId,
    includedSessionIds: input.includedSessionIds ?? [input.resolvedRootSessionId],
    queriedSources: input.queriedSources ?? [],
    payloadFiles: input.payloadFiles.map((file) => file.relativePath),
    warnings: input.warnings,
    generatedAt: new Date().toISOString(),
    ...(input.repo ? { repo: input.repo } : {}),
    ...(input.path ? { path: input.path } : {}),
  };

  for (const file of input.payloadFiles) {
    const targetPath = path.join(bundlePath, file.relativePath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, file.content, { mode: 0o600 });
  }

  const manifestPath = path.join(bundlePath, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), { mode: 0o600 });

  return {
    path: bundlePath,
    manifestPath,
    manifest,
  };
}

export async function materializeTempBundle(input: MaterializeBundleInput): Promise<MaterializedBundle> {
  return materializeBundle(input, os.tmpdir());
}

export async function materializeBundleInDirectory(
  input: MaterializeBundleInput,
  outputRoot: string,
): Promise<MaterializedBundle> {
  return materializeBundle(input, outputRoot);
}

import { chmod, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { BundleManifest, MaterializeBundleInput } from './manifest.js';
import { redactPreview } from '../privacy/redact.js';

export interface MaterializedBundle {
  path: string;
  manifestPath: string;
  manifest: BundleManifest;
}

function assertSafeBundleRelativePath(relativePath: string): void {
  const normalized = path.normalize(relativePath);
  const isWindowsDrivePath = /^[A-Za-z]:[\\/]/.test(relativePath);
  const hasTraversalSegment = relativePath.split(/[\\/]+/).includes('..');

  if (path.isAbsolute(relativePath) || isWindowsDrivePath || normalized === '..' || hasTraversalSegment) {
    throw new Error(`Unsafe bundle payload path: ${relativePath}`);
  }
}

function sanitizeManifestLocation<T extends { value?: string; status: string }>(location: T): T {
  if (!location.value) {
    return location;
  }

  return {
    ...location,
    value: redactPreview(location.value),
  };
}

function safeBundleName(input: MaterializeBundleInput): string {
  return `agentscope-${input.runtime}-${input.resolvedRootSessionId}`.replace(/[^A-Za-z0-9._-]/g, '-');
}

async function assertReplaceableDeterministicBundle(bundlePath: string, input: MaterializeBundleInput): Promise<void> {
  let stats;
  try {
    stats = await lstat(bundlePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }

    throw error;
  }

  if (!stats.isDirectory()) {
    throw new Error('Refusing to replace existing non-agentscope bundle directory');
  }

  try {
    const manifest = JSON.parse(await readFile(path.join(bundlePath, 'manifest.json'), 'utf8')) as Partial<BundleManifest>;
    if (
      manifest.runtime === input.runtime &&
      manifest.resolvedRootSessionId === input.resolvedRootSessionId &&
      Array.isArray(manifest.payloadFiles) &&
      typeof manifest.generatedAt === 'string'
    ) {
      return;
    }
  } catch {
    // Missing or malformed manifests are not positive proof of agentscope ownership.
  }

  throw new Error('Refusing to replace existing non-agentscope bundle directory');
}

async function materializeBundle(
  input: MaterializeBundleInput,
  parentDir: string,
  deterministic = false,
): Promise<MaterializedBundle> {
  for (const file of input.payloadFiles) {
    assertSafeBundleRelativePath(file.relativePath);
  }

  await mkdir(parentDir, { recursive: true });
  const bundlePath = deterministic ? path.join(parentDir, safeBundleName(input)) : await mkdtemp(path.join(parentDir, `agentscope-${input.runtime}-`));
  if (deterministic) {
    await assertReplaceableDeterministicBundle(bundlePath, input);
    await rm(bundlePath, { recursive: true, force: true });
    await mkdir(bundlePath, { recursive: true });
  }
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
    ...(input.repo ? { repo: sanitizeManifestLocation(input.repo) } : {}),
    ...(input.path ? { path: sanitizeManifestLocation(input.path) } : {}),
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
  return materializeBundle(input, outputRoot, true);
}

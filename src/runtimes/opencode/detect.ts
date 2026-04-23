import { access, constants } from 'node:fs/promises';

import type { RuntimeDoctorReport, RuntimeDoctorStore } from '../../core/runtime/detect.js';
import type { OpenCodeRuntimePaths } from './types.js';

async function probe(targetPath?: string): Promise<RuntimeDoctorStore['status']> {
  if (!targetPath) {
    return 'missing';
  }

  try {
    await access(targetPath, constants.R_OK);
    return 'present';
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'unreadable';
  }
}

export async function detectOpenCodeRuntime(paths: OpenCodeRuntimePaths): Promise<RuntimeDoctorReport> {
  const configStatus = await probe(paths.configRoot);
  const dataStatus = await probe(paths.dataRoot);
  const dbStatus = await probe(paths.dbPath);

  const stores: RuntimeDoctorStore[] = [
    { name: 'config', path: paths.configRoot, status: configStatus },
    { name: 'data', path: paths.dataRoot, status: dataStatus },
    { name: 'db', path: paths.dbPath, status: dbStatus },
  ];

  return {
    runtime: 'opencode',
    detected: stores.some((store) => store.status === 'present'),
    repo_status: stores.some((store) => store.status === 'present') ? 'detected' : 'unavailable',
    path_status: stores.every((store) => store.status === 'present')
      ? 'exact'
      : stores.some((store) => store.status === 'present')
        ? 'partial'
        : 'unavailable',
    paths: {
      configRoot: paths.configRoot,
      dataRoot: paths.dataRoot,
      ...(paths.dbPath ? { dbPath: paths.dbPath } : {}),
    },
    stores,
    sanity: stores.map((store) => ({
      name: store.name,
      status: store.status === 'present' ? 'ok' : store.status === 'missing' ? 'warning' : 'error',
      message: `${store.name} ${store.status}`,
    })),
    warnings: stores
      .filter((store) => store.status !== 'present')
      .map((store) => ({
        code: store.status === 'missing' ? 'layout_partial' : 'store_unreadable',
        runtime: 'opencode',
        message: `${store.name} ${store.status}`,
        severity: store.status === 'missing' ? 'warning' : 'error',
      })),
  };
}

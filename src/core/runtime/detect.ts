import { access, constants } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { AgentscopeWarning } from '../warnings.js';
import { createRuntimeRegistry, type RuntimeId } from './registry.js';
import { detectOpenCodeRuntime as detectOpenCodeFixtureRuntime } from '../../runtimes/opencode/detect.js';

export type RuntimeStoreStatus = 'present' | 'missing' | 'unreadable' | 'partial';
export type RuntimeSanityStatus = 'ok' | 'warning' | 'error' | 'skipped';

export interface RuntimeDoctorStore {
  name: string;
  path?: string;
  status: RuntimeStoreStatus;
}

export interface RuntimeDoctorSanity {
  name: string;
  status: RuntimeSanityStatus;
  message: string;
}

export interface RuntimeDoctorReport {
  runtime: RuntimeId;
  detected: boolean;
  repo_status: 'detected' | 'inferred' | 'unavailable';
  path_status: 'exact' | 'partial' | 'unavailable';
  paths: Record<string, string>;
  stores: RuntimeDoctorStore[];
  sanity: RuntimeDoctorSanity[];
  warnings: AgentscopeWarning[];
}

export type RuntimeDetector = () => Promise<RuntimeDoctorReport>;

export interface DetectAllRuntimesOptions {
  detectors?: Partial<Record<RuntimeId, RuntimeDetector>>;
}

interface RuntimeBlueprint {
  runtime: RuntimeId;
  paths: Record<string, string>;
  stores: Array<{ name: string; path: string }>;
}

async function probeStoreStatus(targetPath: string): Promise<RuntimeStoreStatus> {
  try {
    await access(targetPath, constants.R_OK);
    return 'present';
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === 'ENOENT' ? 'missing' : 'unreadable';
  }
}

function buildSanityMessage(name: string, status: RuntimeStoreStatus): RuntimeDoctorSanity {
  if (status === 'present') {
    return {
      name,
      status: 'ok',
      message: `${name} readable`,
    };
  }

  if (status === 'missing') {
    return {
      name,
      status: 'warning',
      message: `${name} missing`,
    };
  }

  return {
    name,
    status: 'error',
    message: `${name} unreadable`,
  };
}

function buildWarnings(runtime: RuntimeId, stores: RuntimeDoctorStore[], detected: boolean): AgentscopeWarning[] {
  const warnings: AgentscopeWarning[] = [];

  if (!detected) {
    warnings.push({
      code: 'runtime_missing',
      runtime,
      message: `${runtime} runtime not found`,
      severity: 'warning',
    });
    return warnings;
  }

  const missingStores = stores.filter((store) => store.status === 'missing');
  if (missingStores.length > 0) {
    warnings.push({
      code: 'layout_partial',
      runtime,
      message: `expected store missing: ${missingStores.map((store) => store.name).join(', ')}`,
      severity: 'warning',
    });
  }

  const unreadableStores = stores.filter((store) => store.status === 'unreadable');
  if (unreadableStores.length > 0) {
    warnings.push({
      code: 'store_unreadable',
      runtime,
      message: `store unreadable: ${unreadableStores.map((store) => store.name).join(', ')}`,
      severity: 'error',
    });
  }

  return warnings;
}

async function detectRuntimeFromBlueprint(blueprint: RuntimeBlueprint): Promise<RuntimeDoctorReport> {
  const stores = await Promise.all(
    blueprint.stores.map(async (store) => ({
      ...store,
      status: await probeStoreStatus(store.path),
    })),
  );

  const detected = stores.some((store) => store.status === 'present' || store.status === 'partial');
  const hasProblemStores = stores.some((store) => store.status !== 'present');

  return {
    runtime: blueprint.runtime,
    detected,
    repo_status: detected ? 'detected' : 'unavailable',
    path_status: detected ? (hasProblemStores ? 'partial' : 'exact') : 'unavailable',
    paths: blueprint.paths,
    stores,
    sanity: stores.map((store) => buildSanityMessage(store.name, store.status)),
    warnings: buildWarnings(blueprint.runtime, stores, detected),
  };
}

function homePath(...segments: string[]): string {
  return path.join(os.homedir(), ...segments);
}

export async function detectClaudeRuntime(): Promise<RuntimeDoctorReport> {
  return detectRuntimeFromBlueprint({
    runtime: 'claude',
    paths: {
      root: homePath('.claude'),
      config: homePath('.claude.json'),
    },
    stores: [
      { name: 'projects', path: homePath('.claude', 'projects') },
      { name: 'usage-data', path: homePath('.claude', 'usage-data') },
    ],
  });
}

export async function detectCodexRuntime(): Promise<RuntimeDoctorReport> {
  return detectRuntimeFromBlueprint({
    runtime: 'codex',
    paths: {
      root: homePath('.codex'),
    },
    stores: [
      { name: 'sessions', path: homePath('.codex', 'sessions') },
      { name: 'session_index', path: homePath('.codex', 'session_index.jsonl') },
    ],
  });
}

export async function detectOpenCodeRuntime(): Promise<RuntimeDoctorReport> {
  return detectRuntimeFromBlueprint({
    runtime: 'opencode',
    paths: {
      configRoot: homePath('.config', 'opencode'),
      dataRoot: homePath('.local', 'share', 'opencode'),
    },
    stores: [
      { name: 'config', path: homePath('.config', 'opencode') },
      { name: 'db', path: homePath('.local', 'share', 'opencode', 'opencode.db') },
    ],
  });
}

function buildDefaultDetectors(): Record<RuntimeId, RuntimeDetector> {
  return {
    claude: detectClaudeRuntime,
    codex: detectCodexRuntime,
    opencode: detectOpenCodeRuntime,
  };
}

function fixtureRoot(env: NodeJS.ProcessEnv): string {
  return env.AGENTSCOPE_FIXTURES_ROOT ?? path.join('fixtures', 'claude', 'sample-project');
}

function codexFixtureRoot(env: NodeJS.ProcessEnv): string {
  return env.AGENTSCOPE_CODEX_FIXTURES_ROOT ?? path.join('fixtures', 'codex');
}

function opencodeFixtureDb(env: NodeJS.ProcessEnv): string {
  return env.AGENTSCOPE_OPENCODE_DB ?? path.join('fixtures', 'opencode', 'opencode.db');
}

function isFixtureMode(env: NodeJS.ProcessEnv): boolean {
  return env.AGENTSCOPE_FIXTURES_MODE === '1';
}

function buildFixtureDetectors(env: NodeJS.ProcessEnv): Record<RuntimeId, RuntimeDetector> {
  return {
    claude: async () => ({
      runtime: 'claude',
      detected: true,
      repo_status: 'detected',
      path_status: 'exact',
      paths: {
        root: fixtureRoot(env),
      },
      stores: [
        { name: 'fixtures', path: fixtureRoot(env), status: 'present' },
      ],
      sanity: [
        { name: 'fixtures', status: 'ok', message: 'fixture root readable' },
      ],
      warnings: [],
    }),
    codex: async () => ({
      runtime: 'codex',
      detected: true,
      repo_status: 'detected',
      path_status: 'exact',
      paths: {
        root: codexFixtureRoot(env),
      },
      stores: [
        { name: 'fixtures', path: codexFixtureRoot(env), status: 'present' },
      ],
      sanity: [
        { name: 'fixtures', status: 'ok', message: 'fixture root readable' },
      ],
      warnings: [],
    }),
    opencode: async () => {
      const layout = env.AGENTSCOPE_OPENCODE_LAYOUT;
      const dbPath = opencodeFixtureDb(env);
      const fixtureDir = path.dirname(dbPath);
      const runtimeReport = await detectOpenCodeFixtureRuntime({
        configRoot: fixtureDir,
        dataRoot: fixtureDir,
        dbPath: layout === 'missing-db' ? path.join(fixtureDir, 'missing-opencode.db') : dbPath,
      });

      if (layout === 'partial-tree') {
        return {
          ...runtimeReport,
          path_status: 'partial',
          warnings: [
            ...runtimeReport.warnings,
            {
              code: 'layout_partial',
              runtime: 'opencode',
              message: 'session linkage rows incomplete',
              severity: 'warning',
            },
          ],
        };
      }

      return runtimeReport;
    },
  };
}

function buildProbeFailureReport(runtime: RuntimeId, error: unknown): RuntimeDoctorReport {
  const message = error instanceof Error ? error.message : 'unknown runtime probe error';

  return {
    runtime,
    detected: false,
    repo_status: 'unavailable',
    path_status: 'unavailable',
    paths: {},
    stores: [],
    sanity: [
      {
        name: runtime,
        status: 'error',
        message,
      },
    ],
    warnings: [
      {
        code: 'probe_failed',
        runtime,
        message,
        severity: 'error',
      },
    ],
  };
}

export async function detectAllRuntimes(options: DetectAllRuntimesOptions = {}): Promise<RuntimeDoctorReport[]> {
  const env = process.env;
  const detectors = {
    ...(isFixtureMode(env) ? buildFixtureDetectors(env) : buildDefaultDetectors()),
    ...options.detectors,
  };

  const registry = createRuntimeRegistry(detectors);
  const reports: RuntimeDoctorReport[] = [];

  for (const entry of registry) {
    try {
      reports.push(await entry.detect());
    } catch (error) {
      reports.push(buildProbeFailureReport(entry.runtime, error));
    }
  }

  return reports;
}

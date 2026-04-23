import type { RuntimeDetector } from './detect.js';

export type RuntimeId = 'claude' | 'codex' | 'opencode';

export const SUPPORTED_RUNTIMES: RuntimeId[] = ['claude', 'codex', 'opencode'];

export interface RuntimeRegistryEntry {
  runtime: RuntimeId;
  detect: RuntimeDetector;
}

const missingDetector: RuntimeDetector = async () => {
  throw new Error('runtime detector not configured');
};

export function createRuntimeRegistry(
  detectors: Partial<Record<RuntimeId, RuntimeDetector>> = {},
): RuntimeRegistryEntry[] {
  return SUPPORTED_RUNTIMES.map((runtime) => ({
    runtime,
    detect: detectors[runtime] ?? missingDetector,
  }));
}

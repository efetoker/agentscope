import type { AgentscopeWarning } from '../warnings.js';
import { SUPPORTED_RUNTIMES, type RuntimeId } from './registry.js';

export function isSupportedRuntime(runtime: string): runtime is RuntimeId {
  return SUPPORTED_RUNTIMES.includes(runtime as RuntimeId);
}

export function runtimeFailureInjected(runtime: RuntimeId, env: NodeJS.ProcessEnv): boolean {
  return (env.AGENTSCOPE_FAIL_RUNTIME ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(runtime);
}

export function runtimeUnavailableWarning(runtime: RuntimeId): AgentscopeWarning {
  return {
    code: 'runtime_unavailable',
    runtime,
    message: `${runtime} runtime unavailable`,
    severity: 'warning',
  };
}

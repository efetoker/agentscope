export type WarningSeverity = 'info' | 'warning' | 'error';

export interface AgentscopeWarning {
  code: string;
  message: string;
  runtime?: string;
  severity?: WarningSeverity;
}

export function formatWarningHuman(warning: AgentscopeWarning): string {
  const runtimePrefix = warning.runtime ? `[${warning.runtime}] ` : '';
  return `${runtimePrefix}${warning.code}: ${warning.message}`;
}

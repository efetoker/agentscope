import type { RuntimeDoctorReport } from '../runtime/detect.js';
import type { SearchMatchSource, SearchResultsEnvelope } from '../types.js';
import { redactPreview } from '../privacy/redact.js';

function canShowPreview(source: SearchMatchSource): boolean {
  return source === 'message_text' || source === 'error';
}

export function formatSearchResultsJson(input: SearchResultsEnvelope) {
  return {
    query: input.query,
    limit: input.limit,
    truncated: input.truncated,
    results: input.results.map((result) => ({
      runtime: result.runtime,
      rootSessionId: result.rootSessionId,
      ...(result.hiddenMatchCount !== undefined ? { hiddenMatchCount: result.hiddenMatchCount } : {}),
      matches: result.matches.map((match) => ({
        nodeSessionId: match.nodeSessionId,
        source: match.source,
        ...(canShowPreview(match.source) && match.preview ? { preview: redactPreview(match.preview) } : {}),
      })),
    })),
    warnings: input.warnings.map((warning) => ({
      code: warning.code,
      message: warning.message,
      ...(warning.runtime ? { runtime: warning.runtime } : {}),
      ...(warning.severity ? { severity: warning.severity } : {}),
    })),
  };
}

export function formatDoctorReportJson(reports: RuntimeDoctorReport[]) {
  return {
    runtimes: reports,
  };
}

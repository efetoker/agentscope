import type { RuntimeDoctorReport } from '../runtime/detect.js';
import type { SearchMatch, SearchMatchSource, SearchResultsEnvelope } from '../types.js';
import { redactPreview } from '../privacy/redact.js';
import { formatWarningHuman } from '../warnings.js';

const MAX_VISIBLE_MATCHES = 5;

function canShowPreview(source: SearchMatchSource): boolean {
  return source === 'message_text' || source === 'error';
}

function sanitizePreview(preview: string): string {
  return redactPreview(preview.split(/\r?\n/, 1)[0]?.trim() ?? '');
}

function formatMatchHuman(match: SearchMatch): string {
  const preview =
    canShowPreview(match.source) && match.preview ? ` preview="${sanitizePreview(match.preview)}"` : '';
  return `  - node=${match.nodeSessionId} source=${match.source}${preview}`;
}

export function formatSearchResultsHuman(input: SearchResultsEnvelope): string {
  const lines: string[] = [`Query: ${input.query}`];

  if (input.warnings.length > 0) {
    lines.push('Warnings:');
    for (const warning of input.warnings) {
      lines.push(`- ${formatWarningHuman(warning)}`);
    }
  }

  if (input.results.length === 0) {
    lines.push('No results');
    return lines.join('\n');
  }

  lines.push('Results:');

  for (const result of input.results) {
    const metadata = [
      result.startedAt ? `date=${result.startedAt}` : undefined,
      result.projectPath ? `path=${result.projectPath}` : undefined,
    ].filter(Boolean).join(' ');
    lines.push(`[${result.runtime}] root=${result.rootSessionId}${metadata ? ` ${metadata}` : ''}`);

    const visibleMatches = result.matches.slice(0, MAX_VISIBLE_MATCHES);
    const hiddenCount = Math.max(
      result.hiddenMatchCount ?? result.matches.length - visibleMatches.length,
      0,
    );

    for (const match of visibleMatches) {
      lines.push(formatMatchHuman(match));
    }

    if (hiddenCount > 0) {
      lines.push(`  + ${hiddenCount} more matches in this tree`);
    }
  }

  if (input.truncated) {
    lines.push(`Truncated to ${input.limit} root results`);
  }

  return lines.join('\n');
}

export function formatDoctorReportHuman(reports: RuntimeDoctorReport[]): string {
  const lines = ['Doctor'];

  for (const report of reports) {
    const storeSummary =
      report.stores.map((store) => `${store.name}:${store.status}`).join(', ') || 'none';
    lines.push(
      `[${report.runtime}] detected=${report.detected ? 'yes' : 'no'} repo_status=${report.repo_status} path_status=${report.path_status} stores=${storeSummary}`,
    );

    for (const warning of report.warnings) {
      lines.push(`  - ${formatWarningHuman(warning)}`);
    }
  }

  return lines.join('\n');
}

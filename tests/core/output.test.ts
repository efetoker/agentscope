import { describe, expect, it } from 'vitest';

import { formatSearchResultsHuman } from '../../src/core/output/human.js';
import { formatSearchResultsJson } from '../../src/core/output/json.js';
import { runtimeUnavailableWarning } from '../../src/core/runtime/availability.js';
import type { SearchResultsEnvelope } from '../../src/core/types.js';
import { formatWarningHuman } from '../../src/core/warnings.js';

const baseFixture: SearchResultsEnvelope = {
  query: 'proxy',
  limit: 20,
  truncated: false,
  results: [
    {
      runtime: 'claude',
      rootSessionId: 'root-1',
      projectPath: '/workspace/project',
      startedAt: '2026-04-26T00:00:00.000Z',
      matches: [
        {
          nodeSessionId: 'root-1',
          source: 'message_text',
          preview: 'proxy config',
        },
        {
          nodeSessionId: 'child-1',
          source: 'tool_result',
          preview: 'raw payload body',
        },
      ],
    },
  ],
  warnings: [
    {
      code: 'repo_root_inferred',
      runtime: 'claude',
      message: 'repo inferred from cwd',
      severity: 'warning',
    },
  ],
};

describe('human search output', () => {
  it('prints grouped root results with warning codes and bounded match previews', () => {
    const output = formatSearchResultsHuman(baseFixture);

    expect(output).toContain('[claude]');
    expect(output).toContain('root-1');
    expect(output).toContain('date=2026-04-26T00:00:00.000Z');
    expect(output).toContain('path=/workspace/project');
    expect(output).toContain('source=message_text');
    expect(output).toContain('repo_root_inferred');
    expect(output).not.toContain('raw payload body');
  });

  it('keeps many matches bounded instead of dumping every row', () => {
    const output = formatSearchResultsHuman({
      ...baseFixture,
      results: [
        {
          runtime: 'claude',
          rootSessionId: 'root-1',
          matches: [
            { nodeSessionId: 'root-1', source: 'message_text', preview: 'match 1' },
            { nodeSessionId: 'child-1', source: 'message_text', preview: 'match 2' },
            { nodeSessionId: 'child-2', source: 'error', preview: 'match 3' },
            { nodeSessionId: 'child-3', source: 'metadata', preview: 'match 4' },
            { nodeSessionId: 'child-4', source: 'tool_result', preview: 'match 5' },
            { nodeSessionId: 'child-5', source: 'tool_result', preview: 'match 6' },
            { nodeSessionId: 'child-6', source: 'session_id', preview: 'match 7' },
          ],
        },
      ],
    });

    expect(output).toContain('+ 2 more matches in this tree');
    expect(output).not.toContain('match 6');
    expect(output).not.toContain('match 7');
  });
});

describe('search JSON output', () => {
  it('returns a structured-only object with deterministic field names and warning objects', () => {
    const output = formatSearchResultsJson(baseFixture);

    expect(Object.keys(output)).toEqual(['query', 'limit', 'truncated', 'results', 'warnings']);
    expect(Array.isArray(output.warnings)).toBe(true);
    expect(output.warnings[0]).toMatchObject({
      code: 'repo_root_inferred',
      runtime: 'claude',
    });
    expect(JSON.stringify(output)).not.toContain('raw payload body');
    expect(output).not.toHaveProperty('summary');
  });

  it('serializes empty warnings consistently', () => {
    const output = formatSearchResultsJson({
      ...baseFixture,
      warnings: [],
    });

    expect(output.warnings).toEqual([]);
  });

  it('redacts sensitive preview content in human and JSON output', () => {
    const sensitiveFixture: SearchResultsEnvelope = {
      ...baseFixture,
      results: [
        {
          runtime: 'claude',
          rootSessionId: 'root-1',
          matches: [
            {
              nodeSessionId: 'root-1',
              source: 'message_text',
              preview: 'user@example.com token=sk-live-secretvalue /Users/alex/project',
            },
          ],
        },
      ],
    };

    const humanOutput = formatSearchResultsHuman(sensitiveFixture);
    const jsonOutput = formatSearchResultsJson(sensitiveFixture);
    const serializedJson = JSON.stringify(jsonOutput);

    expect(humanOutput).toContain('[redacted-email]');
    expect(humanOutput).toContain('token=[redacted-secret]');
    expect(humanOutput).toContain('/Users/[redacted-user]/project');
    expect(serializedJson).toContain('[redacted-email]');
    expect(serializedJson).toContain('token=[redacted-secret]');
    expect(serializedJson).toContain('/Users/[redacted-user]/project');
    expect(humanOutput).not.toContain('user@example.com');
    expect(serializedJson).not.toContain('sk-live-secretvalue');
    expect(serializedJson).not.toContain('/Users/alex');
  });
});

describe('runtime-scoped warnings', () => {
  it.each(['claude', 'codex', 'opencode'] as const)('formats %s warnings with structured runtime scope', (runtime) => {
    const warning = runtimeUnavailableWarning(runtime);
    const human = formatWarningHuman(warning);

    expect(warning).toMatchObject({
      code: 'runtime_unavailable',
      runtime,
      message: 'Runtime unavailable',
      severity: 'warning',
    });
    expect(human).toBe(`[${runtime}] runtime_unavailable: Runtime unavailable`);
    expect(human.toLowerCase()).not.toContain('claude code');
    expect(human.toLowerCase()).not.toContain('jsonl');
  });
});

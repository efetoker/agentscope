import { describe, expect, it } from 'vitest';

import { formatSearchResultsHuman } from '../../src/core/output/human.js';

describe('human output contract', () => {
  it('shows text previews only for text-like matches, caps visible rows, and keeps previews single-line', () => {
    const output = formatSearchResultsHuman({
      query: 'proxy',
      limit: 20,
      truncated: false,
      results: [
        {
          runtime: 'claude',
          rootSessionId: 'root-1',
          matches: [
            { nodeSessionId: 'root-1', source: 'message_text', preview: 'proxy config\nline two' },
            { nodeSessionId: 'child-1', source: 'message_text', preview: 'proxy retry' },
            { nodeSessionId: 'child-2', source: 'error', preview: 'proxy failed' },
            { nodeSessionId: 'child-3', source: 'metadata', preview: 'metadata preview should hide' },
            { nodeSessionId: 'child-4', source: 'tool_result', preview: 'tool_result payload body' },
            { nodeSessionId: 'child-5', source: 'tool_result', preview: 'hidden payload 2' },
            { nodeSessionId: 'child-6', source: 'tool_result', preview: 'hidden payload 3' },
          ],
        },
      ],
      warnings: [],
    });

    expect(output).toContain('+ 2 more matches in this tree');
    expect(output).not.toContain('tool_result payload body');
    expect(output).not.toContain('metadata preview should hide');
    expect(output).not.toContain('line two');
  });
});

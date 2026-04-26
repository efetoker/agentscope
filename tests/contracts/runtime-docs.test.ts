import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const docs = [
  'docs/runtimes/README.md',
  'docs/runtimes/claude-code.md',
  'docs/runtimes/opencode.md',
  'docs/runtimes/codex.md',
];

async function readDoc(path: string): Promise<string> {
  return readFile(path, 'utf8');
}

describe('runtime documentation contract', () => {
  it('documents live stores, fixture mode, and known limitations for every runtime', async () => {
    await expect(readDoc('docs/runtimes/README.md')).resolves.toContain('AGENTSCOPE_FIXTURES_MODE=1');

    const claude = await readDoc('docs/runtimes/claude-code.md');
    expect(claude).toContain('~/.claude/projects/**/*.jsonl');
    expect(claude).toContain('malformed JSONL');
    expect(claude).toContain('AGENTSCOPE_FIXTURES_MODE=1');

    const opencode = await readDoc('docs/runtimes/opencode.md');
    expect(opencode).toContain('~/.local/share/opencode/opencode.db');
    expect(opencode).toContain('project');
    expect(opencode).toContain('session');
    expect(opencode).toContain('message');
    expect(opencode).toContain('part');
    expect(opencode).toContain('AGENTSCOPE_FIXTURES_MODE=1');

    const codex = await readDoc('docs/runtimes/codex.md');
    expect(codex).toContain('~/.codex/session_index.jsonl');
    expect(codex).toContain('~/.codex/sessions/**');
    expect(codex).toContain('observed');
    expect(codex).toContain('conservative');
    expect(codex).toContain('AGENTSCOPE_FIXTURES_MODE=1');
  });

  it('keeps runtime docs free of private local data markers', async () => {
    const unsafePatterns = [
      '/Users/',
      '/home/',
      '.planning/',
      '.superpowers/',
      '.pre-mvp/',
      'sk-',
      'ghp_',
      'xoxb-',
      '-----BEGIN',
      'authorization',
    ];

    for (const doc of docs) {
      const body = await readDoc(doc);
      for (const pattern of unsafePatterns) {
        expect(body, `${doc} must not contain ${pattern}`).not.toContain(pattern);
      }
    }
  });
});

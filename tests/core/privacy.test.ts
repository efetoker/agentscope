import { describe, expect, it } from 'vitest';

import { redactPreview } from '../../src/core/privacy/redact.js';

describe('preview redaction', () => {
  it('redacts emails, obvious secrets, and local user paths', () => {
    const redacted = redactPreview(
      'email user@example.com token=sk-live-secretvalue path /Users/alex/project and /home/sam/repo',
    );

    expect(redacted).toContain('[redacted-email]');
    expect(redacted).toContain('token=[redacted-secret]');
    expect(redacted).toContain('/Users/[redacted-user]/project');
    expect(redacted).toContain('/home/[redacted-user]/repo');
    expect(redacted).not.toContain('user@example.com');
    expect(redacted).not.toContain('sk-live-secretvalue');
    expect(redacted).not.toContain('/Users/alex');
    expect(redacted).not.toContain('/home/sam');
  });

  it('redacts Windows user paths and standalone token prefixes', () => {
    const redacted = redactPreview('C:\\Users\\alex\\repo ghp_abcdefghijklmnopqrstuvwxyz');

    expect(redacted).toContain('C:\\Users\\[redacted-user]\\repo');
    expect(redacted).toContain('[redacted-secret]');
    expect(redacted).not.toContain('alex');
    expect(redacted).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz');
  });

  it('preserves normal session ids needed for follow-up commands', () => {
    expect(redactPreview('root claude-root-1 child child-019d')).toContain('claude-root-1');
    expect(redactPreview('root claude-root-1 child child-019d')).toContain('child-019d');
  });
});

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import type {
  ClaudeLoadInput,
  ClaudeLoadResult,
  ClaudeMessageContentPart,
  ClaudeResolvedTree,
  ClaudeSessionEvent,
  ClaudeSessionRecord,
  ClaudeTreeInput,
} from './types.js';

function byTimestamp(a: ClaudeSessionEvent, b: ClaudeSessionEvent): number {
  return a.timestamp.localeCompare(b.timestamp);
}

function normalizeLoadInput(input: string | ClaudeLoadInput): ClaudeLoadInput {
  return typeof input === 'string' ? { fixturesRoot: input } : input;
}

async function discoverJsonlFiles(root: string, recursive: boolean): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      files.push(entryPath);
    }

    if (recursive && entry.isDirectory()) {
      files.push(...(await discoverJsonlFiles(entryPath, recursive)));
    }
  }

  return files.sort();
}

function normalizeContent(value: unknown, toolUseResult: unknown): ClaudeMessageContentPart[] {
  const parts: ClaudeMessageContentPart[] = [];
  const content = typeof value === 'string' ? [{ type: 'text', text: value }] : Array.isArray(value) ? value : [];

  for (const part of content) {
    if (!part || typeof part !== 'object') {
      continue;
    }

    const candidate = part as Record<string, unknown>;
    if (candidate.type === 'text' && typeof candidate.text === 'string') {
      parts.push({ type: 'text', text: candidate.text });
    }

    if (candidate.type === 'tool_use') {
      parts.push({
        type: 'tool_use',
        ...(typeof candidate.name === 'string' ? { name: candidate.name } : {}),
        ...(candidate.input && typeof candidate.input === 'object' ? { input: candidate.input as Record<string, unknown> } : {}),
      });
    }

    if (candidate.type === 'tool_result') {
      const text = typeof candidate.text === 'string' ? candidate.text : typeof candidate.content === 'string' ? candidate.content : undefined;
      parts.push({ type: 'tool_result', ...(text ? { text } : {}) });
    }
  }

  if (toolUseResult && typeof toolUseResult === 'object') {
    parts.push({ type: 'tool_result', text: JSON.stringify(toolUseResult) });
  }

  return parts;
}

function normalizeEvent(raw: Record<string, unknown>, file: string): ClaudeSessionEvent {
  const sessionId = typeof raw.sessionId === 'string' ? raw.sessionId : path.basename(file, '.jsonl');
  const cwd = typeof raw.cwd === 'string' ? raw.cwd : '';
  const message = raw.message && typeof raw.message === 'object' ? (raw.message as Record<string, unknown>) : {};
  const rootSessionId = typeof raw.rootSessionId === 'string' ? raw.rootSessionId : sessionId;
  const parentSessionId = typeof raw.parentSessionId === 'string' ? raw.parentSessionId : null;

  return {
    sessionId,
    rootSessionId,
    parentSessionId,
    ...(typeof raw.uuid === 'string' ? { uuid: raw.uuid } : {}),
    ...(typeof raw.parentUuid === 'string' || raw.parentUuid === null ? { parentUuid: raw.parentUuid } : {}),
    timestamp: typeof raw.timestamp === 'string' ? raw.timestamp : '',
    repoPath: typeof raw.repoPath === 'string' ? raw.repoPath : cwd,
    cwd,
    pathHint: typeof raw.pathHint === 'string' ? raw.pathHint : cwd,
    ...(typeof raw.type === 'string' ? { type: raw.type } : {}),
    message: {
      content: normalizeContent(message.content, raw.toolUseResult),
    },
  };
}

function linkLiveSubagentSessions(sessions: ClaudeSessionRecord[]): void {
  for (const session of sessions) {
    const parentDir = path.dirname(session.sourcePath);
    if (path.basename(parentDir) !== 'subagents' || session.rootSessionId !== session.sessionId || session.parentSessionId !== null) {
      continue;
    }

    const projectDir = path.dirname(parentDir);
    const parentCandidates = sessions.filter(
      (candidate) => path.dirname(candidate.sourcePath) === projectDir && candidate.parentSessionId === null,
    );

    if (parentCandidates.length !== 1) {
      continue;
    }

    const parent = parentCandidates[0];
    session.rootSessionId = parent.rootSessionId;
    session.parentSessionId = parent.sessionId;
    for (const event of session.events) {
      event.rootSessionId = parent.rootSessionId;
      event.parentSessionId = parent.sessionId;
    }
  }
}

export async function loadClaudeSessionsWithWarnings(input: string | ClaudeLoadInput): Promise<ClaudeLoadResult> {
  const loadInput = normalizeLoadInput(input);
  const root = loadInput.liveProjectsRoot ?? loadInput.fixturesRoot;
  if (!root) {
    throw new Error('Claude sessions root is required');
  }

  const files = await discoverJsonlFiles(root, Boolean(loadInput.liveProjectsRoot));

  const sessions: ClaudeSessionRecord[] = [];
  const warnings: ClaudeLoadResult['warnings'] = [];

  for (const file of files) {
    let raw: string;
    try {
      raw = await readFile(file, 'utf8');
    } catch {
      warnings.push({
        code: 'claude_jsonl_unreadable',
        runtime: 'claude',
        message: 'Unreadable Claude JSONL file skipped',
        severity: 'warning',
      });
      continue;
    }

    const events: ClaudeSessionEvent[] = [];

    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      try {
        events.push(normalizeEvent(JSON.parse(trimmed) as Record<string, unknown>, file));
      } catch {
        warnings.push({
          code: 'claude_jsonl_malformed',
          runtime: 'claude',
          message: 'Malformed Claude JSONL line skipped',
          severity: 'warning',
        });
      }
    }

    events.sort(byTimestamp);

    if (events.length === 0) {
      continue;
    }

    const first = events[0];
    sessions.push({
      sessionId: first.sessionId,
      rootSessionId: first.rootSessionId,
      parentSessionId: first.parentSessionId,
      repoPath: first.repoPath,
      cwd: first.cwd,
      pathHint: first.pathHint,
      sourcePath: file,
      events,
    });
  }

  if (loadInput.liveProjectsRoot) {
    linkLiveSubagentSessions(sessions);
  }

  const sorted = sessions.sort((left, right) => {
    if (left.rootSessionId !== right.rootSessionId) {
      return left.rootSessionId.localeCompare(right.rootSessionId);
    }

    if (left.parentSessionId === null && right.parentSessionId !== null) {
      return -1;
    }

    if (left.parentSessionId !== null && right.parentSessionId === null) {
      return 1;
    }

    return left.sessionId.localeCompare(right.sessionId);
  });

  return { sessions: sorted, warnings };
}

export async function loadClaudeSessions(input: string | ClaudeLoadInput): Promise<ClaudeSessionRecord[]> {
  return (await loadClaudeSessionsWithWarnings(input)).sessions;
}

function resolveSessionMatch(sessions: ClaudeSessionRecord[], sessionId: string): ClaudeSessionRecord {
  const normalized = sessionId.toLowerCase();
  const matches = sessions.filter((session) => session.sessionId.toLowerCase().includes(normalized));

  if (matches.length === 0) {
    throw new Error(`Claude session not found: ${sessionId}`);
  }

  if (matches.length > 1) {
    throw new Error(`Ambiguous Claude session id: ${sessionId}`);
  }

  return matches[0];
}

export async function expandClaudeTree(input: ClaudeTreeInput): Promise<ClaudeResolvedTree> {
  const { sessions, warnings } = await loadClaudeSessionsWithWarnings(input);
  const matched = resolveSessionMatch(sessions, input.sessionId);
  const treeSessions = sessions.filter((session) => session.rootSessionId === matched.rootSessionId);

  return {
    runtime: 'claude',
    rootSessionId: matched.rootSessionId,
    sessionIds: treeSessions.map((session) => session.sessionId),
    sessions: treeSessions,
    warnings,
  };
}

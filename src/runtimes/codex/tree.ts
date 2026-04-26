import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import type { AgentscopeWarning } from '../../core/warnings.js';
import type {
  CodexLoadInput,
  CodexLoadResult,
  CodexResolvedTree,
  CodexRolloutEvent,
  CodexSessionIndexEntry,
  CodexSessionRecord,
  CodexTreeInput,
} from './types.js';
import { resolveCodexHome, resolveCodexSessionIndex, resolveCodexSessionsRoot } from './detect.js';

function warning(code: string, message: string): AgentscopeWarning {
  return { code, runtime: 'codex', message, severity: 'warning' };
}

function normalizeLoadInput(input: string | CodexLoadInput): CodexLoadInput {
  return typeof input === 'string' ? { fixturesRoot: input } : input;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string') {
      return value;
    }
  }
  return undefined;
}

function collectText(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectText);
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => {
    if (['text', 'content', 'message', 'output', 'input', 'cwd', 'model', 'role'].includes(key)) {
      return collectText(entry);
    }
    return typeof entry === 'object' ? collectText(entry) : [];
  });
}

function sortEvents(events: CodexRolloutEvent[]): CodexRolloutEvent[] {
  return events.sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}

async function discoverJsonlFiles(root: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      files.push(entryPath);
    }
    if (entry.isDirectory()) {
      files.push(...(await discoverJsonlFiles(entryPath)));
    }
  }
  return files.sort();
}

function parseJsonl(raw: string, warnings: AgentscopeWarning[]): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        rows.push(parsed as Record<string, unknown>);
      }
    } catch {
      warnings.push(warning('codex_jsonl_malformed', 'Malformed Codex JSONL line skipped'));
    }
  }
  return rows;
}

async function loadSessionIndex(fixturesRoot: string): Promise<CodexSessionIndexEntry[]> {
  const raw = await readFile(path.join(fixturesRoot, 'session_index.jsonl'), 'utf8');

  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as CodexSessionIndexEntry);
}

async function loadRollout(fixturesRoot: string, rolloutPath: string): Promise<CodexRolloutEvent[]> {
  const raw = await readFile(path.join(fixturesRoot, rolloutPath), 'utf8');

  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as CodexRolloutEvent)
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}

async function loadFixtureSessions(fixturesRoot: string): Promise<CodexSessionRecord[]> {
  const index = await loadSessionIndex(fixturesRoot);

  return Promise.all(
    index.map(async (entry) => ({
      sessionId: entry.session_id,
      rootSessionId: entry.root_session_id ?? entry.session_id,
      parentSessionId: entry.parent_session_id ?? null,
      repoPath: entry.repo_path,
      pathHint: entry.path_hint,
      timestamp: entry.timestamp,
      rolloutPath: entry.rollout_path,
      sourcePath: path.join(fixturesRoot, entry.rollout_path),
      linkageConfidence: entry.root_session_id ? 'durable' : 'unknown',
      events: await loadRollout(fixturesRoot, entry.rollout_path),
    })),
  );
}

async function loadLiveIndex(indexPath: string, warnings: AgentscopeWarning[]): Promise<CodexSessionIndexEntry[]> {
  try {
    const raw = await readFile(indexPath, 'utf8');
    return parseJsonl(raw, warnings).map((row) => ({
      session_id: stringValue(row.session_id) ?? stringValue(row.id) ?? path.basename(stringValue(row.rollout_path) ?? indexPath, '.jsonl'),
      root_session_id: stringValue(row.root_session_id) ?? stringValue(row.rootSessionId),
      parent_session_id: stringValue(row.parent_session_id) ?? stringValue(row.parentSessionId) ?? null,
      rollout_path: stringValue(row.rollout_path) ?? stringValue(row.path) ?? '',
      repo_path: stringValue(row.repo_path) ?? stringValue(row.cwd) ?? '',
      path_hint: stringValue(row.path_hint) ?? stringValue(row.cwd) ?? stringValue(row.repo_path) ?? '',
      timestamp: stringValue(row.timestamp) ?? stringValue(row.created_at) ?? '',
    }));
  } catch {
    warnings.push(warning('codex_index_unreadable', 'Codex session index unreadable'));
    return [];
  }
}

function normalizeLiveEvent(raw: Record<string, unknown>, fallback: CodexSessionIndexEntry): CodexRolloutEvent {
  const payload = objectValue(raw.payload);
  const message = objectValue(raw.message) ?? objectValue(payload?.message);
  const item = objectValue(raw.item) ?? objectValue(payload?.item);
  const rawType = firstString(raw.type, raw.record_type, item?.type, payload?.type) ?? 'metadata';
  const text = collectText(raw).join(' ').trim();
  const payloadSessionId = rawType === 'session_meta' ? firstString(payload?.id) : undefined;
  const sessionId = firstString(raw.session_id, raw.sessionId, payload?.session_id, payload?.sessionId, payloadSessionId, fallback.session_id) ?? fallback.session_id;
  const rootSessionId = firstString(raw.root_session_id, raw.rootSessionId, fallback.root_session_id, sessionId) ?? sessionId;

  return {
    session_id: sessionId,
    root_session_id: rootSessionId,
    parent_session_id: firstString(raw.parent_session_id, raw.parentSessionId, fallback.parent_session_id) ?? null,
    timestamp: firstString(raw.timestamp, raw.time, payload?.timestamp, fallback.timestamp) ?? '',
    repo_path: firstString(raw.repo_path, raw.cwd, payload?.repo_path, payload?.cwd, fallback.repo_path) ?? fallback.repo_path,
    path_hint: firstString(raw.path_hint, raw.cwd, payload?.path_hint, payload?.cwd, fallback.path_hint) ?? fallback.path_hint,
    rawType,
    ...(raw.usage ? { tokens: raw.usage } : {}),
    event: {
      type: rawType === 'event_msg' || rawType === 'response_item' ? 'message' : rawType === 'tool_result' ? 'tool_result' : 'metadata',
      text,
    },
  };
}

async function loadLiveRollout(file: string, fallback: CodexSessionIndexEntry, warnings: AgentscopeWarning[]): Promise<CodexRolloutEvent[]> {
  try {
    const raw = await readFile(file, 'utf8');
    return sortEvents(parseJsonl(raw, warnings).map((row) => normalizeLiveEvent(row, fallback)));
  } catch {
    warnings.push(warning('codex_rollout_unreadable', 'Codex rollout file unreadable'));
    return [];
  }
}

function resolveRolloutPath(codexHome: string, sessionsRoot: string, rolloutPath: string): string {
  if (path.isAbsolute(rolloutPath)) {
    return rolloutPath;
  }
  if (rolloutPath.startsWith('sessions/')) {
    return path.join(codexHome, rolloutPath);
  }
  return path.join(sessionsRoot, rolloutPath);
}

function hasRolloutPath(entry: CodexSessionIndexEntry): boolean {
  return entry.rollout_path.trim().length > 0;
}

function discoveredEntry(file: string): CodexSessionIndexEntry {
  return {
    session_id: '',
    rollout_path: file,
    repo_path: '',
    path_hint: '',
    timestamp: '',
  };
}

async function loadLiveSessions(input: CodexLoadInput, warnings: AgentscopeWarning[]): Promise<CodexSessionRecord[]> {
  const codexHome = input.liveCodexHome ?? resolveCodexHome();
  const indexPath = input.sessionIndexJsonl ?? resolveCodexSessionIndex({ AGENTSCOPE_CODEX_HOME: codexHome });
  const sessionsRoot = input.sessionsRoot ?? resolveCodexSessionsRoot({ AGENTSCOPE_CODEX_HOME: codexHome });
  const index = await loadLiveIndex(indexPath, warnings);
  const indexedEntries = index.filter(hasRolloutPath);
  const discoveredFiles = await discoverJsonlFiles(sessionsRoot);

  if (index.length > 0 && indexedEntries.length === 0) {
    warnings.push(warning('codex_index_unusable', 'Codex session index has no rollout paths; using recursive session discovery'));
  }

  const entriesByPath = new Map<string, CodexSessionIndexEntry>();
  for (const entry of indexedEntries) {
    entriesByPath.set(resolveRolloutPath(codexHome, sessionsRoot, entry.rollout_path), entry);
  }

  for (const file of discoveredFiles) {
    if (!entriesByPath.has(file)) {
      entriesByPath.set(file, discoveredEntry(file));
    }
  }

  const entries = Array.from(entriesByPath.values());

  if (entries.length === 0) {
    warnings.push(warning('codex_store_missing', 'No supported Codex live store found'));
  }

  const sessions: CodexSessionRecord[] = [];
  for (const entry of entries) {
    const rolloutFile = resolveRolloutPath(codexHome, sessionsRoot, entry.rollout_path);
    const events = await loadLiveRollout(rolloutFile, entry, warnings);
    if (events.length === 0) {
      warnings.push(warning('codex_rollout_missing', 'Codex rollout file missing or empty'));
    }
    const first = events[0];
    const durable = Boolean(entry.root_session_id);
    if (!durable) {
      warnings.push(warning('codex_linkage_uncertain', 'Codex parent/root metadata unavailable; session treated as root'));
    }
    const sessionId = entry.session_id || first?.session_id || path.basename(rolloutFile, '.jsonl');
    const rootSessionId = entry.root_session_id ?? first?.root_session_id ?? sessionId;
    const parentSessionId = entry.parent_session_id ?? first?.parent_session_id ?? null;
    const repoPath = entry.repo_path || first?.repo_path || '';
    const pathHint = entry.path_hint || first?.path_hint || entry.repo_path || '';
    const timestamp = entry.timestamp || first?.timestamp || '';
    const normalizedEvents = events.map((event) => ({
      ...event,
      session_id: event.session_id || sessionId,
      root_session_id: event.root_session_id || rootSessionId,
      parent_session_id: event.parent_session_id ?? parentSessionId,
      repo_path: event.repo_path || repoPath,
      path_hint: event.path_hint || pathHint,
      timestamp: event.timestamp || timestamp,
    }));

    sessions.push({
      sessionId,
      rootSessionId,
      parentSessionId,
      repoPath,
      pathHint,
      timestamp,
      rolloutPath: entry.rollout_path || rolloutFile,
      sourcePath: rolloutFile,
      linkageConfidence: durable ? 'durable' : 'unknown',
      events: normalizedEvents,
    });
  }
  return sessions;
}

export async function loadCodexSessionsWithWarnings(input: string | CodexLoadInput): Promise<CodexLoadResult> {
  const loadInput = normalizeLoadInput(input);
  const warnings: AgentscopeWarning[] = [];
  const sessions = loadInput.fixturesRoot
    ? await loadFixtureSessions(loadInput.fixturesRoot)
    : await loadLiveSessions(loadInput, warnings);
  return { sessions, warnings };
}

export async function loadCodexSessions(input: string | CodexLoadInput): Promise<CodexSessionRecord[]> {
  return (await loadCodexSessionsWithWarnings(input)).sessions;
}

function resolveCodexMatch(sessions: CodexSessionRecord[], sessionId: string): CodexSessionRecord {
  const normalized = sessionId.toLowerCase();
  const matches = sessions.filter((session) => session.sessionId.toLowerCase().includes(normalized));

  if (matches.length === 0) {
    throw new Error(`Codex session not found: ${sessionId}`);
  }

  if (matches.length > 1) {
    throw new Error(`Ambiguous Codex session id: ${sessionId}`);
  }

  return matches[0];
}

export async function expandCodexTree(input: CodexTreeInput): Promise<CodexResolvedTree> {
  const { sessions, warnings } = await loadCodexSessionsWithWarnings(input);
  const matched = resolveCodexMatch(sessions, input.sessionId);
  const treeSessions = sessions.filter((session) => session.rootSessionId === matched.rootSessionId);

  return {
    runtime: 'codex',
    rootSessionId: matched.rootSessionId,
    sessionIds: treeSessions.map((session) => session.sessionId),
    sessions: treeSessions,
    warnings,
  };
}

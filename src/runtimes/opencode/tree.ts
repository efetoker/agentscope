import Database from 'better-sqlite3';

import type {
  OpenCodeEventRow,
  OpenCodeLoadInput,
  OpenCodeLoadResult,
  OpenCodeMessagePart,
  OpenCodeMessageRecord,
  OpenCodeResolvedTree,
  OpenCodeSessionRecord,
  OpenCodeSessionRow,
  OpenCodeTreeInput,
} from './types.js';
import type { AgentscopeWarning } from '../../core/warnings.js';

interface LiveProjectRow {
  id: string;
  worktree: string | null;
}

interface LiveSessionRow {
  id: string;
  project_id: string | null;
  parent_id: string | null;
  directory: string | null;
  time: string | number | null;
}

interface LiveMessageRow {
  id: string;
  session_id: string;
  data: string | null;
}

interface LivePartRow {
  id: string;
  session_id: string;
  message_id: string | null;
  data: string | null;
}

function normalizeLoadInput(input: string | OpenCodeLoadInput): OpenCodeLoadInput {
  return typeof input === 'string' ? { fixtureDb: input } : input;
}

function warning(code: string, message: string): AgentscopeWarning {
  return { code, runtime: 'opencode', message, severity: 'warning' };
}

function parseJsonObject(value: string | null, warnings: AgentscopeWarning[]): Record<string, unknown> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    warnings.push(warning('opencode_json_malformed', 'Malformed OpenCode JSON payload skipped'));
    return {};
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function joinedObjectStrings(value: unknown, keys: string[]): string | undefined {
  const object = objectValue(value);
  if (!object) {
    return undefined;
  }

  const values = keys.map((key) => stringValue(object[key])).filter((value): value is string => Boolean(value));
  return values.length > 0 ? values.join(' ') : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function normalizePart(row: LivePartRow, warnings: AgentscopeWarning[]): OpenCodeMessagePart {
  const data = parseJsonObject(row.data, warnings);
  const text = stringValue(data.text) ?? stringValue(data.content) ?? stringValue(data.output);
  const type = stringValue(data.type);
  const name = stringValue(data.name);
  const kind: OpenCodeMessagePart['kind'] = type === 'tool' || Boolean(name) || data.input ? 'tool' : text ? 'text' : 'metadata';

  return {
    id: row.id,
    ...(row.message_id ? { messageId: row.message_id } : {}),
    kind,
    ...(text ? { text } : {}),
    data,
  };
}

function loadFixtureSessions(db: Database): OpenCodeSessionRecord[] {
  const sessionRows = db
    .prepare<OpenCodeSessionRow>('SELECT id, root_id, parent_id, repo_path, path_hint, created_at FROM sessions ORDER BY created_at, id')
    .all();

  const eventRows = db.prepare<OpenCodeEventRow>('SELECT id, session_id, kind, body FROM events ORDER BY id').all();

  const eventsBySession = new Map<string, OpenCodeEventRow[]>();
  for (const event of eventRows) {
    const bucket = eventsBySession.get(event.session_id) ?? [];
    bucket.push(event);
    eventsBySession.set(event.session_id, bucket);
  }

  return sessionRows.map((row) => ({
    sessionId: row.id,
    rootSessionId: row.root_id,
    parentSessionId: row.parent_id,
    repoPath: row.repo_path,
    pathHint: row.path_hint,
    createdAt: row.created_at,
    events: eventsBySession.get(row.id) ?? [],
    messages: [],
  }));
}

function resolveRoot(row: LiveSessionRow, sessionsById: Map<string, LiveSessionRow>, warnings: AgentscopeWarning[]): string {
  let current = row;
  const seen = new Set<string>();

  while (current.parent_id) {
    if (seen.has(current.id)) {
      warnings.push(warning('opencode_parent_cycle', 'OpenCode parent cycle detected; session treated as root'));
      return row.id;
    }

    seen.add(current.id);
    const parent = sessionsById.get(current.parent_id);
    if (!parent) {
      warnings.push(warning('opencode_parent_missing', 'OpenCode parent session missing; session treated as root'));
      return row.id;
    }

    current = parent;
  }

  return current.id;
}

function loadLiveSessions(db: Database, warnings: AgentscopeWarning[]): OpenCodeSessionRecord[] {
  const projects = db.prepare<LiveProjectRow>('SELECT id, worktree FROM project').all();
  const sessions = db
    .prepare<LiveSessionRow>(
      'SELECT id, project_id, parent_id, directory, time_created AS time FROM "session" ORDER BY time_created, id',
    )
    .all();
  const messages = db.prepare<LiveMessageRow>('SELECT id, session_id, data FROM message ORDER BY id').all();
  const parts = db.prepare<LivePartRow>('SELECT id, session_id, message_id, data FROM part ORDER BY id').all();

  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const sessionsById = new Map(sessions.map((session) => [session.id, session]));
  const partsByMessage = new Map<string, OpenCodeMessagePart[]>();
  for (const row of parts) {
    if (!row.message_id) {
      continue;
    }

    const bucket = partsByMessage.get(row.message_id) ?? [];
    bucket.push(normalizePart(row, warnings));
    partsByMessage.set(row.message_id, bucket);
  }

  const messagesBySession = new Map<string, OpenCodeMessageRecord[]>();
  for (const row of messages) {
    const data = parseJsonObject(row.data, warnings);
    const model = objectValue(data.model);
    const providerID = stringValue(data.providerID) ?? stringValue(model?.providerID);
    const modelID = stringValue(data.modelID) ?? stringValue(model?.modelID);
    const pathValue = stringValue(data.path) ?? joinedObjectStrings(data.path, ['cwd', 'root']);
    const timeValue = stringValue(data.time) ?? joinedObjectStrings(data.time, ['created', 'completed']);
    const message: OpenCodeMessageRecord = {
      id: row.id,
      sessionId: row.session_id,
      ...(stringValue(data.role) ? { role: stringValue(data.role) } : {}),
      ...(stringValue(data.agent) ? { agent: stringValue(data.agent) } : {}),
      ...(providerID ? { providerID } : {}),
      ...(modelID ? { modelID } : {}),
      ...(data.tokens ? { tokens: data.tokens } : {}),
      ...(numberValue(data.cost) !== undefined ? { cost: numberValue(data.cost) } : {}),
      ...(pathValue ? { path: pathValue } : {}),
      ...(timeValue ? { time: timeValue } : {}),
      data,
      parts: partsByMessage.get(row.id) ?? [],
    };
    const bucket = messagesBySession.get(row.session_id) ?? [];
    bucket.push(message);
    messagesBySession.set(row.session_id, bucket);
  }

  return sessions.map((row) => {
    const project = row.project_id ? projectsById.get(row.project_id) : undefined;
    return {
      sessionId: row.id,
      rootSessionId: resolveRoot(row, sessionsById, warnings),
      parentSessionId: row.parent_id,
      repoPath: project?.worktree ?? row.directory ?? '',
      pathHint: row.directory ?? project?.worktree ?? '',
      createdAt: row.time === null ? '' : String(row.time),
      events: [],
      messages: messagesBySession.get(row.id) ?? [],
    };
  });
}

export function loadOpenCodeSessionsWithWarnings(input: string | OpenCodeLoadInput): OpenCodeLoadResult {
  const loadInput = normalizeLoadInput(input);
  const dbPath = loadInput.liveDb ?? loadInput.fixtureDb;
  if (!dbPath) {
    throw new Error('OpenCode database path is required');
  }

  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  const warnings: AgentscopeWarning[] = [];

  try {
    return {
      sessions: loadInput.liveDb ? loadLiveSessions(db, warnings) : loadFixtureSessions(db),
      warnings,
    };
  } finally {
    db.close();
  }
}

export function loadOpenCodeSessions(input: string | OpenCodeLoadInput): OpenCodeSessionRecord[] {
  return loadOpenCodeSessionsWithWarnings(input).sessions;
}

function resolveOpenCodeMatch(records: OpenCodeSessionRecord[], sessionId: string): OpenCodeSessionRecord {
  const matches = records.filter((record) => record.sessionId.toLowerCase().includes(sessionId.toLowerCase()));

  if (matches.length === 0) {
    throw new Error(`OpenCode session not found: ${sessionId}`);
  }

  if (matches.length > 1) {
    throw new Error(`Ambiguous OpenCode session id: ${sessionId}`);
  }

  return matches[0];
}

export async function expandOpenCodeTree(input: OpenCodeTreeInput): Promise<OpenCodeResolvedTree> {
  const { sessions, warnings } = loadOpenCodeSessionsWithWarnings(input);
  const matched = resolveOpenCodeMatch(sessions, input.sessionId);
  const treeSessions = sessions.filter((session) => session.rootSessionId === matched.rootSessionId);

  return {
    runtime: 'opencode',
    rootSessionId: matched.rootSessionId,
    sessionIds: treeSessions.map((session) => session.sessionId),
    sessions: treeSessions,
    warnings,
  };
}

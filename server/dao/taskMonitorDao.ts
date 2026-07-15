import { initDb } from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import { getWebSocketHub, TaskMonitorEventType } from '../gateway/webSocketHub.js';

export type TodoStatus = 'pending' | 'in_progress' | 'done';
export type TodoSource = 'auto' | 'manual';
export type TodoPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface TodoItem {
  id: string;
  sessionId: string;
  text: string;
  status: TodoStatus;
  source: TodoSource;
  priority: TodoPriority;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface Artifact {
  id: string;
  sessionId: string;
  messageId: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  description: string | null;
  createdAt: string;
}

export type ToolCallStatus = 'running' | 'success' | 'error' | 'cancelled' | 'retrying';
export type ToolType = 'skill' | 'mcp' | 'system' | 'builtin';

export interface ToolCall {
  id: string;
  sessionId: string;
  messageId: string;
  toolName: string;
  toolType: ToolType;
  status: ToolCallStatus;
  arguments: Record<string, unknown> | null;
  result: unknown;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  retryCount: number;
  maxRetries: number;
  lastRetryAt: string | null;
  retryDelayMs: number;
}

export type TaskFlowStatus = 'queued' | 'running' | 'waiting' | 'succeeded' | 'failed' | 'cancelled';
export type TaskFlowSyncMode = 'managed' | 'task_mirrored';

export interface TaskFlowStep {
  id: string;
  flowId: string;
  index: number;
  taskType: string;
  taskName: string;
  taskDescription: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  arguments: Record<string, unknown> | null;
  result: unknown;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  dependsOn: string[];
  nextStepIds: string[];
}

export interface TaskFlow {
  id: string;
  sessionId: string;
  name: string;
  description: string;
  status: TaskFlowStatus;
  syncMode: TaskFlowSyncMode;
  currentStepId: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
}

export interface TrajectoryEvent {
  id: string;
  traceId: string;
  schemaVersion: number;
  source: 'runtime' | 'transcript' | 'export';
  type: string;
  ts: string;
  seq: number;
  sessionId: string;
  runId: string | null;
  entryId: string | null;
  parentEntryId: string | null;
  data: Record<string, unknown> | null;
  provider: string | null;
  modelId: string | null;
  workspaceDir: string | null;
}

function db() {
  return initDb();
}

function nowIso(): string {
  return new Date().toISOString();
}

function publishTaskMonitorEvent(sessionId: string, type: TaskMonitorEventType, payload: unknown): void {
  try {
    const hub = getWebSocketHub();
    hub.publishTaskMonitorEvent({
      type,
      sessionId,
      payload,
      timestamp: Date.now(),
    });
  } catch {
    // ignore
  }
}

function normalizeTodoRow(row: Record<string, unknown>): TodoItem {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    text: String(row.text),
    status: row.status as TodoStatus,
    source: row.source as TodoSource,
    priority: row.priority as TodoPriority,
    orderIndex: Number(row.order_index),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
  };
}

function normalizeArtifactRow(row: Record<string, unknown>): Artifact {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    messageId: String(row.message_id),
    fileName: String(row.file_name),
    filePath: String(row.file_path),
    fileSize: Number(row.file_size),
    mimeType: String(row.mime_type),
    description: row.description ? String(row.description) : null,
    createdAt: String(row.created_at),
  };
}

function normalizeToolCallRow(row: Record<string, unknown>): ToolCall {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    messageId: String(row.message_id),
    toolName: String(row.tool_name),
    toolType: row.tool_type as ToolType,
    status: row.status as ToolCallStatus,
    arguments: row.arguments_json ? JSON.parse(String(row.arguments_json)) : null,
    result: row.result_json ? JSON.parse(String(row.result_json)) : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
    startedAt: String(row.started_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    durationMs: row.duration_ms != null ? Number(row.duration_ms) : null,
    retryCount: Number(row.retry_count ?? 0),
    maxRetries: Number(row.max_retries ?? 3),
    lastRetryAt: row.last_retry_at ? String(row.last_retry_at) : null,
    retryDelayMs: Number(row.retry_delay_ms ?? 1000),
  };
}

function normalizeTrajectoryRow(row: Record<string, unknown>): TrajectoryEvent {
  return {
    id: String(row.id),
    traceId: String(row.trace_id),
    schemaVersion: Number(row.schema_version),
    source: row.source as 'runtime' | 'transcript' | 'export',
    type: String(row.type),
    ts: String(row.ts),
    seq: Number(row.seq),
    sessionId: String(row.session_id),
    runId: row.run_id ? String(row.run_id) : null,
    entryId: row.entry_id ? String(row.entry_id) : null,
    parentEntryId: row.parent_entry_id ? String(row.parent_entry_id) : null,
    data: row.data_json ? JSON.parse(String(row.data_json)) : null,
    provider: row.provider ? String(row.provider) : null,
    modelId: row.model_id ? String(row.model_id) : null,
    workspaceDir: row.workspace_dir ? String(row.workspace_dir) : null,
  };
}

// ===================== Todo Items =====================

export interface TodoQueryOptions {
  status?: TodoStatus;
  priority?: TodoPriority;
  sortBy?: 'orderIndex' | 'createdAt' | 'updatedAt' | 'priority';
  sortOrder?: 'asc' | 'desc';
}

export function findTodosBySession(sessionId: string, options: TodoQueryOptions = {}): TodoItem[] {
  const whereClauses: string[] = ['session_id = ?'];
  const params: unknown[] = [sessionId];

  if (options.status) {
    whereClauses.push('status = ?');
    params.push(options.status);
  }
  if (options.priority) {
    whereClauses.push('priority = ?');
    params.push(options.priority);
  }

  let orderBy = 'order_index ASC, created_at DESC';
  if (options.sortBy) {
    const sortMap: Record<string, string> = {
      orderIndex: 'order_index',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      priority: 'priority',
    };
    const column = sortMap[options.sortBy] || 'order_index';
    const order = options.sortOrder?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    orderBy = `${column} ${order}`;
  }

  const rows = db()
    .prepare(`SELECT * FROM todo_items WHERE ${whereClauses.join(' AND ')} ORDER BY ${orderBy}`)
    .all(...params) as Array<Record<string, unknown>>;
  return rows.map(normalizeTodoRow);
}

export interface TodoStats {
  total: number;
  pending: number;
  inProgress: number;
  done: number;
  byPriority: {
    low: number;
    normal: number;
    high: number;
    urgent: number;
  };
}

export function getTodoStats(sessionId: string): TodoStats {
  const rows = db()
    .prepare('SELECT status, priority, COUNT(*) as count FROM todo_items WHERE session_id = ? GROUP BY status, priority')
    .all(sessionId) as Array<Record<string, unknown>>;

  const stats: TodoStats = {
    total: 0,
    pending: 0,
    inProgress: 0,
    done: 0,
    byPriority: { low: 0, normal: 0, high: 0, urgent: 0 },
  };

  for (const row of rows) {
    const count = Number(row.count);
    const status = row.status as TodoStatus;
    const priority = row.priority as TodoPriority;

    stats.total += count;
    if (status === 'pending') stats.pending += count;
    else if (status === 'in_progress') stats.inProgress += count;
    else if (status === 'done') stats.done += count;

    if (priority === 'low') stats.byPriority.low += count;
    else if (priority === 'normal') stats.byPriority.normal += count;
    else if (priority === 'high') stats.byPriority.high += count;
    else if (priority === 'urgent') stats.byPriority.urgent += count;
  }

  return stats;
}

export function updateTodoPriority(id: string, priority: TodoPriority): TodoItem | undefined {
  return updateTodo(id, { priority });
}

export function updateTodoOrder(id: string, orderIndex: number): TodoItem | undefined {
  return updateTodo(id, { orderIndex });
}

export function deleteTodosBatch(ids: string[]): number {
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => '?').join(', ');
  const result = db()
    .prepare(`DELETE FROM todo_items WHERE id IN (${placeholders})`)
    .run(...ids);
  return result.changes;
}

export function reorderTodos(sessionId: string, orderedIds: string[]): number {
  if (orderedIds.length === 0) return 0;
  const updateStmt = db().prepare('UPDATE todo_items SET order_index = ?, updated_at = ? WHERE id = ? AND session_id = ?');
  const now = nowIso();
  const tx = db().transaction((ids: string[]) => {
    let count = 0;
    for (let i = 0; i < ids.length; i++) {
      const result = updateStmt.run(i, now, ids[i], sessionId);
      count += result.changes;
    }
    return count;
  });
  return tx(orderedIds);
}

export function createTodo(data: {
  sessionId: string;
  text: string;
  status?: TodoStatus;
  source?: TodoSource;
  priority?: TodoPriority;
  orderIndex?: number;
}): TodoItem {
  const id = uuidv4();
  const now = nowIso();
  const status = data.status || 'pending';
  db()
    .prepare(
      `INSERT INTO todo_items (id, session_id, text, status, source, priority, order_index, created_at, updated_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      data.sessionId,
      data.text,
      status,
      data.source || 'manual',
      data.priority || 'normal',
      data.orderIndex ?? 0,
      now,
      now,
      status === 'done' ? now : null
    );
  const todo = findTodoById(id)!;
  publishTaskMonitorEvent(data.sessionId, 'todo_created', todo);
  return todo;
}

export function findTodoById(id: string): TodoItem | undefined {
  const row = db().prepare('SELECT * FROM todo_items WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? normalizeTodoRow(row) : undefined;
}

export function updateTodo(
  id: string,
  data: Partial<{
    text: string;
    status: TodoStatus;
    priority: TodoPriority;
    orderIndex: number;
  }>
): TodoItem | undefined {
  const existing = findTodoById(id);
  if (!existing) return undefined;

  const fields: string[] = [];
  const vals: unknown[] = [];
  const now = nowIso();

  if (data.text !== undefined) {
    fields.push('text = ?');
    vals.push(data.text);
  }
  if (data.status !== undefined) {
    fields.push('status = ?');
    vals.push(data.status);
    if (data.status === 'done') {
      fields.push('completed_at = ?');
      vals.push(now);
    } else if (existing.completedAt) {
      fields.push('completed_at = ?');
      vals.push(null);
    }
  }
  if (data.priority !== undefined) {
    fields.push('priority = ?');
    vals.push(data.priority);
  }
  if (data.orderIndex !== undefined) {
    fields.push('order_index = ?');
    vals.push(data.orderIndex);
  }

  if (fields.length === 0) return existing;

  fields.push('updated_at = ?');
  vals.push(now);
  vals.push(id);

  db().prepare(`UPDATE todo_items SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
  const updated = findTodoById(id);
  if (updated) {
    publishTaskMonitorEvent(updated.sessionId, 'todo_updated', updated);
  }
  return updated;
}

export function deleteTodo(id: string): boolean {
  const existing = findTodoById(id);
  const result = db().prepare('DELETE FROM todo_items WHERE id = ?').run(id);
  if (result.changes > 0 && existing) {
    publishTaskMonitorEvent(existing.sessionId, 'todo_deleted', { id });
  }
  return result.changes > 0;
}

export function batchCreateTodos(
  todos: Array<{
    sessionId: string;
    text: string;
    source?: TodoSource;
    priority?: TodoPriority;
    status?: TodoStatus;
  }>
): TodoItem[] {
  const created: TodoItem[] = [];
  const insert = db().prepare(
    `INSERT INTO todo_items (id, session_id, text, status, source, priority, order_index, created_at, updated_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const now = nowIso();
  const tx = db().transaction((items: typeof todos) => {
    for (let i = 0; i < items.length; i++) {
      const t = items[i];
      const id = uuidv4();
      const status = t.status || 'pending';
      const completedAt = status === 'done' ? now : null;
      insert.run(
        id,
        t.sessionId,
        t.text,
        status,
        t.source || 'auto',
        t.priority || 'normal',
        i,
        now,
        now,
        completedAt
      );
      created.push({
        id,
        sessionId: t.sessionId,
        text: t.text,
        status: status as TodoStatus,
        source: (t.source || 'auto') as TodoSource,
        priority: (t.priority || 'normal') as TodoPriority,
        orderIndex: i,
        createdAt: now,
        updatedAt: now,
        completedAt,
      });
    }
  });
  tx(todos);
  for (const todo of created) {
    publishTaskMonitorEvent(todo.sessionId, 'todo_created', todo);
  }
  return created;
}

// ===================== Artifacts =====================

export interface ArtifactQueryOptions {
  type?: string;
  search?: string;
  sortBy?: 'createdAt' | 'fileName' | 'fileSize';
  sortOrder?: 'asc' | 'desc';
}

export function findArtifactsBySession(sessionId: string, options: ArtifactQueryOptions = {}): Artifact[] {
  const whereClauses: string[] = ['session_id = ?'];
  const params: unknown[] = [sessionId];

  if (options.type) {
    whereClauses.push('mime_type LIKE ?');
    params.push(`${options.type}%`);
  }
  if (options.search) {
    whereClauses.push('file_name LIKE ?');
    params.push(`%${options.search}%`);
  }

  let orderBy = 'created_at DESC';
  if (options.sortBy) {
    const sortMap: Record<string, string> = {
      createdAt: 'created_at',
      fileName: 'file_name',
      fileSize: 'file_size',
    };
    const column = sortMap[options.sortBy] || 'created_at';
    const order = options.sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    orderBy = `${column} ${order}`;
  }

  const rows = db()
    .prepare(`SELECT * FROM artifacts WHERE ${whereClauses.join(' AND ')} ORDER BY ${orderBy}`)
    .all(...params) as Array<Record<string, unknown>>;
  return rows.map(normalizeArtifactRow);
}

export function deleteArtifactsBatch(ids: string[]): number {
  if (ids.length === 0) return 0;
  const existingArtifacts = ids.map(id => findArtifactById(id)).filter((a): a is Artifact => a !== undefined);
  const placeholders = ids.map(() => '?').join(', ');
  const result = db()
    .prepare(`DELETE FROM artifacts WHERE id IN (${placeholders})`)
    .run(...ids);
  for (const artifact of existingArtifacts) {
    publishTaskMonitorEvent(artifact.sessionId, 'artifact_deleted', { id: artifact.id });
  }
  return result.changes;
}

export function findArtifactById(id: string): Artifact | undefined {
  const row = db().prepare('SELECT * FROM artifacts WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? normalizeArtifactRow(row) : undefined;
}

export function findArtifactByFilePath(filePath: string): Artifact | undefined {
  const row = db().prepare('SELECT * FROM artifacts WHERE file_path = ?').get(filePath) as
    | Record<string, unknown>
    | undefined;
  return row ? normalizeArtifactRow(row) : undefined;
}

export function createArtifact(data: {
  sessionId: string;
  messageId: string;
  fileName: string;
  filePath: string;
  fileSize?: number;
  mimeType?: string;
  description?: string;
}): Artifact {
  const id = uuidv4();
  const now = nowIso();
  db()
    .prepare(
      `INSERT INTO artifacts (id, session_id, message_id, file_name, file_path, file_size, mime_type, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      data.sessionId,
      data.messageId,
      data.fileName,
      data.filePath,
      data.fileSize || 0,
      data.mimeType || 'application/octet-stream',
      data.description || null,
      now
    );
  const artifact = findArtifactById(id)!;
  publishTaskMonitorEvent(data.sessionId, 'artifact_created', artifact);
  return artifact;
}

// ===================== Tool Calls =====================

export interface ToolCallQueryOptions {
  type?: ToolType;
  status?: ToolCallStatus;
  search?: string;
  sortBy?: 'startedAt' | 'completedAt' | 'duration' | 'toolName';
  sortOrder?: 'asc' | 'desc';
}

export interface ToolCallStats {
  total: number;
  success: number;
  error: number;
  running: number;
  cancelled: number;
  byType: Record<string, number>;
  avgDurationMs: number | null;
  minDurationMs: number | null;
  maxDurationMs: number | null;
}

export function findToolCallsBySession(sessionId: string, options: ToolCallQueryOptions = {}): ToolCall[] {
  const whereClauses: string[] = ['session_id = ?'];
  const params: unknown[] = [sessionId];

  if (options.type) {
    whereClauses.push('tool_type = ?');
    params.push(options.type);
  }
  if (options.status) {
    whereClauses.push('status = ?');
    params.push(options.status);
  }
  if (options.search) {
    whereClauses.push('tool_name LIKE ?');
    params.push(`%${options.search}%`);
  }

  let orderBy = 'started_at DESC';
  if (options.sortBy) {
    const sortMap: Record<string, string> = {
      startedAt: 'started_at',
      completedAt: 'completed_at',
      duration: 'duration_ms',
      toolName: 'tool_name',
    };
    const column = sortMap[options.sortBy] || 'started_at';
    const order = options.sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    orderBy = `${column} ${order}`;
  }

  const rows = db()
    .prepare(`SELECT * FROM tool_calls WHERE ${whereClauses.join(' AND ')} ORDER BY ${orderBy}`)
    .all(...params) as Array<Record<string, unknown>>;
  return rows.map(normalizeToolCallRow);
}

export function getToolCallStats(sessionId: string): ToolCallStats {
  const row = db()
    .prepare(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
        AVG(duration_ms) as avg_duration,
        MIN(duration_ms) as min_duration,
        MAX(duration_ms) as max_duration
       FROM tool_calls WHERE session_id = ?`
    )
    .get(sessionId) as Record<string, unknown>;

  const typeRows = db()
    .prepare(
      `SELECT tool_type, COUNT(*) as count FROM tool_calls WHERE session_id = ? GROUP BY tool_type`
    )
    .all(sessionId) as Array<Record<string, unknown>>;

  const byType: Record<string, number> = {};
  for (const r of typeRows) {
    byType[String(r.tool_type)] = Number(r.count);
  }

  return {
    total: Number(row.total),
    success: Number(row.success),
    error: Number(row.error),
    running: Number(row.running),
    cancelled: Number(row.cancelled),
    byType,
    avgDurationMs: row.avg_duration != null ? Number(row.avg_duration) : null,
    minDurationMs: row.min_duration != null ? Number(row.min_duration) : null,
    maxDurationMs: row.max_duration != null ? Number(row.max_duration) : null,
  };
}

export function findToolCallsByMessage(messageId: string): ToolCall[] {
  const rows = db()
    .prepare('SELECT * FROM tool_calls WHERE message_id = ? ORDER BY started_at ASC')
    .all(messageId) as Array<Record<string, unknown>>;
  return rows.map(normalizeToolCallRow);
}

export function createToolCall(data: {
  sessionId: string;
  messageId: string;
  toolName: string;
  toolType?: ToolType;
  arguments?: Record<string, unknown>;
  maxRetries?: number;
  retryDelayMs?: number;
}): ToolCall {
  const id = uuidv4();
  const now = nowIso();
  const maxRetries = data.maxRetries ?? 3;
  const retryDelayMs = data.retryDelayMs ?? 1000;
  db()
    .prepare(
      `INSERT INTO tool_calls (id, session_id, message_id, tool_name, tool_type, status, arguments_json, started_at, retry_count, max_retries, retry_delay_ms)
       VALUES (?, ?, ?, ?, ?, 'running', ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      data.sessionId,
      data.messageId,
      data.toolName,
      data.toolType || 'mcp',
      data.arguments ? JSON.stringify(data.arguments) : null,
      now,
      0,
      maxRetries,
      retryDelayMs
    );
  const toolCall: ToolCall = {
    id,
    sessionId: data.sessionId,
    messageId: data.messageId,
    toolName: data.toolName,
    toolType: (data.toolType || 'mcp') as ToolType,
    status: 'running' as ToolCallStatus,
    arguments: data.arguments || null,
    result: null,
    errorMessage: null,
    startedAt: now,
    completedAt: null,
    durationMs: null,
    retryCount: 0,
    maxRetries,
    lastRetryAt: null,
    retryDelayMs,
  };
  publishTaskMonitorEvent(data.sessionId, 'tool_call_created', toolCall);
  return toolCall;
}

export function completeToolCall(
  id: string,
  result: { success: boolean; result?: unknown; error?: string }
): ToolCall | undefined {
  const existing = db().prepare('SELECT * FROM tool_calls WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) return undefined;

  const now = nowIso();
  const startedAt = new Date(String(existing.started_at)).getTime();
  const durationMs = Date.now() - startedAt;
  const status = result.success ? 'success' : 'error';
  const sessionId = String(existing.session_id);

  db()
    .prepare(
      `UPDATE tool_calls SET status = ?, result_json = ?, error_message = ?, completed_at = ?, duration_ms = ?
       WHERE id = ?`
    )
    .run(
      status,
      result.result !== undefined ? JSON.stringify(result.result) : null,
      result.error || null,
      now,
      durationMs,
      id
    );
  const updated = findToolCallById(id);
  if (updated) {
    publishTaskMonitorEvent(sessionId, 'tool_call_updated', updated);
  }
  return updated;
}

export function retryToolCall(id: string): ToolCall | undefined {
  const existing = findToolCallById(id);
  if (!existing) return undefined;

  if (existing.retryCount >= existing.maxRetries) {
    return existing;
  }

  const now = nowIso();
  const newRetryCount = existing.retryCount + 1;

  db()
    .prepare(
      `UPDATE tool_calls SET status = ?, retry_count = ?, last_retry_at = ?, completed_at = ?, result_json = ?, error_message = ?, duration_ms = ?
       WHERE id = ?`
    )
    .run(
      'retrying',
      newRetryCount,
      now,
      null,
      null,
      null,
      null,
      id
    );

  setTimeout(() => {
    db().prepare('UPDATE tool_calls SET status = ? WHERE id = ?').run('running', id);
    publishTaskMonitorEvent(existing.sessionId, 'tool_call_updated', { id, status: 'running', retryCount: newRetryCount });
  }, existing.retryDelayMs * Math.pow(2, newRetryCount - 1));

  const updated = findToolCallById(id);
  if (updated) {
    publishTaskMonitorEvent(existing.sessionId, 'tool_call_updated', updated);
  }
  return updated;
}

export function scheduleRetryForFailedToolCalls(sessionId: string): number {
  const rows = db()
    .prepare(`SELECT * FROM tool_calls WHERE session_id = ? AND status = 'error' AND retry_count < max_retries`)
    .all(sessionId) as Array<Record<string, unknown>>;

  let count = 0;
  for (const row of rows) {
    const toolCall = normalizeToolCallRow(row);
    if (toolCall.retryCount < toolCall.maxRetries) {
      retryToolCall(toolCall.id);
      count++;
    }
  }
  return count;
}

export function findToolCallById(id: string): ToolCall | undefined {
  const row = db().prepare('SELECT * FROM tool_calls WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? normalizeToolCallRow(row) : undefined;
}

// ===================== Trajectory Events =====================

export interface TrajectoryStats {
  totalEvents: number;
  byType: Record<string, number>;
  bySource: Record<string, number>;
  traceCount: number;
  firstTs: string | null;
  lastTs: string | null;
}

export function searchTrajectoryEvents(sessionId: string, keyword: string): TrajectoryEvent[] {
  const rows = db()
    .prepare(
      `SELECT * FROM trajectory_events 
       WHERE session_id = ? AND (type LIKE ? OR data_json LIKE ?)
       ORDER BY seq ASC`
    )
    .all(sessionId, `%${keyword}%`, `%${keyword}%`) as Array<Record<string, unknown>>;
  return rows.map(normalizeTrajectoryRow);
}

export function getTrajectoryStats(sessionId: string): TrajectoryStats {
  const row = db()
    .prepare(
      `SELECT 
        COUNT(*) as total_events,
        COUNT(DISTINCT trace_id) as trace_count,
        MIN(ts) as first_ts,
        MAX(ts) as last_ts
       FROM trajectory_events WHERE session_id = ?`
    )
    .get(sessionId) as Record<string, unknown>;

  const typeRows = db()
    .prepare(
      `SELECT type, COUNT(*) as count FROM trajectory_events WHERE session_id = ? GROUP BY type ORDER BY count DESC`
    )
    .all(sessionId) as Array<Record<string, unknown>>;

  const sourceRows = db()
    .prepare(
      `SELECT source, COUNT(*) as count FROM trajectory_events WHERE session_id = ? GROUP BY source`
    )
    .all(sessionId) as Array<Record<string, unknown>>;

  const byType: Record<string, number> = {};
  for (const r of typeRows) {
    byType[String(r.type)] = Number(r.count);
  }

  const bySource: Record<string, number> = {};
  for (const r of sourceRows) {
    bySource[String(r.source)] = Number(r.count);
  }

  return {
    totalEvents: Number(row.total_events),
    byType,
    bySource,
    traceCount: Number(row.trace_count),
    firstTs: row.first_ts ? String(row.first_ts) : null,
    lastTs: row.last_ts ? String(row.last_ts) : null,
  };
}

export function recordTrajectoryEvent(data: Omit<TrajectoryEvent, 'id' | 'seq'> & { seq?: number }): TrajectoryEvent {
  const id = uuidv4();
  const sessionEvents = db()
    .prepare('SELECT COALESCE(MAX(seq), -1) as max_seq FROM trajectory_events WHERE session_id = ?')
    .get(data.sessionId) as { max_seq: number };
  const seq = data.seq ?? (sessionEvents.max_seq + 1);

  db()
    .prepare(
      `INSERT INTO trajectory_events 
       (id, trace_id, schema_version, source, type, ts, seq, session_id, run_id, entry_id, parent_entry_id, data_json, provider, model_id, workspace_dir)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      data.traceId,
      data.schemaVersion ?? 1,
      data.source,
      data.type,
      data.ts,
      seq,
      data.sessionId,
      data.runId,
      data.entryId,
      data.parentEntryId,
      data.data ? JSON.stringify(data.data) : null,
      data.provider,
      data.modelId,
      data.workspaceDir
    );

  const event = {
    ...data,
    id,
    seq,
  } as TrajectoryEvent;
  publishTaskMonitorEvent(data.sessionId, 'trajectory_event_created', event);
  return event;
}

export function getTrajectoryBySession(sessionId: string): TrajectoryEvent[] {
  const rows = db()
    .prepare('SELECT * FROM trajectory_events WHERE session_id = ? ORDER BY seq ASC')
    .all(sessionId) as Array<Record<string, unknown>>;
  return rows.map(normalizeTrajectoryRow);
}

export function getTrajectoryByTrace(traceId: string): TrajectoryEvent[] {
  const rows = db()
    .prepare('SELECT * FROM trajectory_events WHERE trace_id = ? ORDER BY seq ASC')
    .all(traceId) as Array<Record<string, unknown>>;
  return rows.map(normalizeTrajectoryRow);
}

export function getSessionTraces(sessionId: string): Array<{ traceId: string; eventCount: number; firstTs: string; lastTs: string }> {
  const rows = db()
    .prepare(
      `SELECT trace_id, COUNT(*) as event_count, MIN(ts) as first_ts, MAX(ts) as last_ts
       FROM trajectory_events WHERE session_id = ? GROUP BY trace_id ORDER BY first_ts DESC`
    )
    .all(sessionId) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    traceId: String(r.trace_id),
    eventCount: Number(r.event_count),
    firstTs: String(r.first_ts),
    lastTs: String(r.last_ts),
  }));
}

export function exportTrajectoryBundle(traceId: string): {
  manifest: {
    traceSchema: string;
    schemaVersion: number;
    generatedAt: string;
    traceId: string;
    sessionId: string;
    eventCount: number;
    events: TrajectoryEvent[];
  };
  events: TrajectoryEvent[];
} {
  const events = getTrajectoryByTrace(traceId);
  const sessionId = events.length > 0 ? events[0].sessionId : '';
  return {
    manifest: {
      traceSchema: 'cdf-trajectory',
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      traceId,
      sessionId,
      eventCount: events.length,
      events: [],
    },
    events,
  };
}

export interface TodoImportItem {
  text: string;
  status?: 'pending' | 'in_progress' | 'done';
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  source?: 'auto' | 'manual';
}

export interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: string[];
}

export function importTodos(sessionId: string, items: TodoImportItem[]): ImportResult {
  const result: ImportResult = {
    success: true,
    imported: 0,
    skipped: 0,
    errors: [],
  };

  const existingTexts = new Set(
    (db()
      .prepare('SELECT text FROM todo_items WHERE session_id = ?')
      .all(sessionId) as Array<{ text: string }>)
      .map((row) => row.text.trim())
  );

  const now = nowIso();
  let orderIndex = 0;

  const existingMaxOrder = db()
    .prepare('SELECT MAX(order_index) as max FROM todo_items WHERE session_id = ?')
    .get(sessionId) as { max: number | null } | undefined;
  if (existingMaxOrder && existingMaxOrder.max !== null) {
    orderIndex = existingMaxOrder.max + 1;
  }

  for (const item of items) {
    if (!item.text?.trim()) {
      result.errors.push('待办文本不能为空');
      result.skipped++;
      continue;
    }

    if (existingTexts.has(item.text.trim())) {
      result.skipped++;
      continue;
    }

    try {
      db()
        .prepare(
          `INSERT INTO todo_items (id, session_id, text, status, priority, source, order_index, created_at, updated_at, completed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          uuidv4(),
          sessionId,
          item.text.trim(),
          item.status || 'pending',
          item.priority || 'normal',
          item.source || 'manual',
          orderIndex++,
          now,
          now,
          item.status === 'done' ? now : null
        );
      result.imported++;
    } catch (e) {
      result.errors.push(`导入失败: ${(e as Error).message}`);
      result.success = false;
    }
  }

  return result;
}

export function exportTodos(sessionId: string): { data: Array<{
  id: string;
  text: string;
  status: string;
  priority: string;
  source: string;
  createdAt: string;
  updatedAt: string;
}> } {
  const todos = db()
    .prepare(`SELECT id, text, status, priority, source, created_at as createdAt, updated_at as updatedAt 
              FROM todo_items WHERE session_id = ? ORDER BY order_index`)
    .all(sessionId);

  return { data: todos as any[] };
}

export function exportAllTodos(): { data: Array<{
  sessionId: string;
  id: string;
  text: string;
  status: string;
  priority: string;
  source: string;
  createdAt: string;
  updatedAt: string;
}> } {
  const todos = db()
    .prepare(`SELECT session_id as sessionId, id, text, status, priority, source, created_at as createdAt, updated_at as updatedAt 
              FROM todo_items ORDER BY session_id, order_index`)
    .all();

  return { data: todos as any[] };
}

export function exportArtifacts(sessionId: string): { data: Array<{
  id: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  description: string | null;
  createdAt: string;
}> } {
  const artifacts = db()
    .prepare(`SELECT id, file_name as fileName, file_path as filePath, file_size as fileSize, mime_type as mimeType, description, created_at as createdAt 
              FROM artifacts WHERE session_id = ? ORDER BY created_at DESC`)
    .all(sessionId);

  return { data: artifacts as any[] };
}

export function exportToolCalls(sessionId: string): { data: Array<{
  id: string;
  toolName: string;
  toolType: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
}> } {
  const toolCalls = db()
    .prepare(`SELECT id, tool_name as toolName, tool_type as toolType, status, started_at as startedAt, completed_at as completedAt, duration_ms as durationMs 
              FROM tool_calls WHERE session_id = ? ORDER BY started_at DESC`)
    .all(sessionId);

  return { data: toolCalls as any[] };
}

export function exportTrajectory(sessionId: string): { data: Array<{
  id: string;
  traceId: string;
  type: string;
  source: string;
  ts: string;
  data: Record<string, unknown> | null;
}> } {
  const events = db()
    .prepare(`SELECT id, trace_id as traceId, type, source, ts, data 
              FROM trajectory_events WHERE session_id = ? ORDER BY seq`)
    .all(sessionId);

  return { data: events.map((e: any) => ({ ...e, data: e.data ? JSON.parse(e.data) : null })) };
}

// ===================== Task Flow Orchestration =====================

function normalizeTaskFlowRow(row: Record<string, unknown>): TaskFlow {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    name: String(row.name),
    description: String(row.description || ''),
    status: row.status as TaskFlowStatus,
    syncMode: row.sync_mode as TaskFlowSyncMode,
    currentStepId: row.current_step_id ? String(row.current_step_id) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    startedAt: row.started_at ? String(row.started_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
    totalSteps: Number(row.total_steps),
    completedSteps: Number(row.completed_steps),
    failedSteps: Number(row.failed_steps),
  };
}

function normalizeTaskFlowStepRow(row: Record<string, unknown>): TaskFlowStep {
  return {
    id: String(row.id),
    flowId: String(row.flow_id),
    index: Number(row.step_index),
    taskType: String(row.task_type),
    taskName: String(row.task_name),
    taskDescription: String(row.task_description || ''),
    status: row.status as 'pending' | 'running' | 'completed' | 'failed' | 'skipped',
    arguments: row.arguments_json ? JSON.parse(String(row.arguments_json)) : null,
    result: row.result_json ? JSON.parse(String(row.result_json)) : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
    startedAt: row.started_at ? String(row.started_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
    dependsOn: row.depends_on ? JSON.parse(String(row.depends_on)) : [],
    nextStepIds: row.next_step_ids ? JSON.parse(String(row.next_step_ids)) : [],
  };
}

export function createTaskFlow(data: {
  sessionId: string;
  name: string;
  description?: string;
  syncMode?: TaskFlowSyncMode;
  steps: Array<{
    taskType: string;
    taskName: string;
    taskDescription?: string;
    arguments?: Record<string, unknown>;
    dependsOn?: string[];
  }>;
}): TaskFlow {
  const id = uuidv4();
  const now = nowIso();
  const syncMode = data.syncMode || 'managed';

  db()
    .prepare(
      `INSERT INTO task_flows (id, session_id, name, description, status, sync_mode, current_step_id, created_at, updated_at, started_at, completed_at, total_steps, completed_steps, failed_steps)
       VALUES (?, ?, ?, ?, 'queued', ?, NULL, ?, ?, NULL, NULL, ?, 0, 0)`
    )
    .run(id, data.sessionId, data.name, data.description || '', syncMode, now, now, data.steps.length);

  // 预生成所有步骤 ID，便于建立 next_step_ids 依赖关系
  const stepRecords = data.steps.map((step, index) => ({
    id: uuidv4(),
    index,
    taskName: step.taskName,
    taskType: step.taskType,
    taskDescription: step.taskDescription || '',
    arguments: step.arguments,
    dependsOn: step.dependsOn || [],
  }));

  for (const record of stepRecords) {
    const nextStepIds = stepRecords
      .filter(s => s.index > record.index && s.dependsOn.includes(record.taskName))
      .map(s => s.id);

    db()
      .prepare(
        `INSERT INTO task_flow_steps (id, flow_id, step_index, task_type, task_name, task_description, status, arguments_json, depends_on, next_step_ids)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
      )
      .run(
        record.id,
        id,
        record.index,
        record.taskType,
        record.taskName,
        record.taskDescription,
        record.arguments ? JSON.stringify(record.arguments) : null,
        JSON.stringify(record.dependsOn),
        JSON.stringify(nextStepIds)
      );
  }

  const flow = findTaskFlowById(id)!;
  publishTaskMonitorEvent(data.sessionId, 'task_flow_created', flow);
  return flow;
}

export function findTaskFlowById(id: string): TaskFlow | undefined {
  const row = db().prepare('SELECT * FROM task_flows WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? normalizeTaskFlowRow(row) : undefined;
}

export function findTaskFlowsBySession(sessionId: string): TaskFlow[] {
  const rows = db()
    .prepare('SELECT * FROM task_flows WHERE session_id = ? ORDER BY created_at DESC')
    .all(sessionId) as Array<Record<string, unknown>>;
  return rows.map(normalizeTaskFlowRow);
}

export function findTaskFlowSteps(flowId: string): TaskFlowStep[] {
  const rows = db()
    .prepare('SELECT * FROM task_flow_steps WHERE flow_id = ? ORDER BY step_index ASC')
    .all(flowId) as Array<Record<string, unknown>>;
  return rows.map(normalizeTaskFlowStepRow);
}

export function startTaskFlow(flowId: string): TaskFlow | undefined {
  const flow = findTaskFlowById(flowId);
  if (!flow || flow.status !== 'queued') return undefined;

  const now = nowIso();
  const steps = findTaskFlowSteps(flowId);
  const firstStep = steps.find(s => s.status === 'pending' && (!s.dependsOn || s.dependsOn.length === 0));

  db()
    .prepare('UPDATE task_flows SET status = ?, current_step_id = ?, started_at = ?, updated_at = ? WHERE id = ?')
    .run('running', firstStep?.id || null, now, now, flowId);

  if (firstStep) {
    db()
      .prepare('UPDATE task_flow_steps SET status = ?, started_at = ? WHERE id = ?')
      .run('running', now, firstStep.id);
  }

  const updated = findTaskFlowById(flowId);
  if (updated) {
    publishTaskMonitorEvent(updated.sessionId, 'task_flow_updated', updated);
  }
  return updated;
}

export function completeTaskFlowStep(stepId: string, result: { success: boolean; result?: unknown; error?: string }): TaskFlowStep | undefined {
  const step = db().prepare('SELECT * FROM task_flow_steps WHERE id = ?').get(stepId) as
    | Record<string, unknown>
    | undefined;
  if (!step) return undefined;

  const now = nowIso();
  const flowId = String(step.flow_id);
  const sessionId = String((db().prepare('SELECT session_id FROM task_flows WHERE id = ?').get(flowId) as Record<string, unknown> | undefined)?.session_id);
  const status = result.success ? 'completed' : 'failed';

  db()
    .prepare(
      `UPDATE task_flow_steps SET status = ?, result_json = ?, error_message = ?, completed_at = ? WHERE id = ?`
    )
    .run(
      status,
      result.result !== undefined ? JSON.stringify(result.result) : null,
      result.error || null,
      now,
      stepId
    );

  const flow = findTaskFlowById(flowId);
  if (flow) {
    const steps = findTaskFlowSteps(flowId);
    const completedSteps = steps.filter(s => s.status === 'completed').length;
    const failedSteps = steps.filter(s => s.status === 'failed').length;
    const pendingSteps = steps.filter(s => s.status === 'pending');

    let nextStep: TaskFlowStep | undefined;
    for (const pendingStep of pendingSteps) {
      const dependencies = pendingStep.dependsOn || [];
      const allDependenciesCompleted = dependencies.every(depName => {
        const depStep = steps.find(s => s.taskName === depName);
        return depStep && depStep.status === 'completed';
      });
      if (allDependenciesCompleted) {
        nextStep = pendingStep;
        break;
      }
    }

    let flowStatus: TaskFlowStatus = flow.status;
    let completedAt: string | null = null;

    if (failedSteps > 0) {
      flowStatus = 'failed';
      completedAt = now;
    } else if (completedSteps === steps.length) {
      flowStatus = 'succeeded';
      completedAt = now;
    } else if (nextStep) {
      flowStatus = 'running';
      db().prepare('UPDATE task_flow_steps SET status = ?, started_at = ? WHERE id = ?')
        .run('running', now, nextStep.id);
    } else if (pendingSteps.length > 0) {
      flowStatus = 'waiting';
    }

    db()
      .prepare(
        `UPDATE task_flows SET status = ?, current_step_id = ?, completed_steps = ?, failed_steps = ?, completed_at = ?, updated_at = ? WHERE id = ?`
      )
      .run(flowStatus, nextStep?.id || null, completedSteps, failedSteps, completedAt, now, flowId);

    const updatedFlow = findTaskFlowById(flowId);
    if (updatedFlow) {
      publishTaskMonitorEvent(sessionId, 'task_flow_updated', updatedFlow);
    }
  }

  const updated = db().prepare('SELECT * FROM task_flow_steps WHERE id = ?').get(stepId) as
    | Record<string, unknown>
    | undefined;
  return updated ? normalizeTaskFlowStepRow(updated) : undefined;
}

export function cancelTaskFlow(flowId: string): TaskFlow | undefined {
  const flow = findTaskFlowById(flowId);
  if (!flow) return undefined;

  const now = nowIso();
  db()
    .prepare('UPDATE task_flows SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?')
    .run('cancelled', now, now, flowId);

  db()
    .prepare('UPDATE task_flow_steps SET status = ?, completed_at = ? WHERE flow_id = ? AND status != ?')
    .run('skipped', now, flowId, 'completed');

  const updated = findTaskFlowById(flowId);
  if (updated) {
    publishTaskMonitorEvent(updated.sessionId, 'task_flow_updated', updated);
  }
  return updated;
}

export function retryTaskFlow(flowId: string): TaskFlow | undefined {
  const flow = findTaskFlowById(flowId);
  if (!flow || flow.status !== 'failed') return undefined;

  const now = nowIso();

  db()
    .prepare('UPDATE task_flow_steps SET status = ?, result_json = ?, error_message = ?, started_at = ?, completed_at = ? WHERE flow_id = ?')
    .run('pending', null, null, null, null, flowId);

  db()
    .prepare('UPDATE task_flows SET status = ?, current_step_id = ?, started_at = ?, completed_at = ?, completed_steps = ?, failed_steps = ?, updated_at = ? WHERE id = ?')
    .run('queued', null, null, null, 0, 0, now, flowId);

  const updated = findTaskFlowById(flowId);
  if (updated) {
    publishTaskMonitorEvent(updated.sessionId, 'task_flow_updated', updated);
  }
  return updated;
}

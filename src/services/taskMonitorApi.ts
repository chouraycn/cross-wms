import { API_BASE } from '../constants/api';

const TASK_MONITOR_BASE = `${API_BASE}/task-monitor`;
const WS_BASE = API_BASE.replace(/^http/, 'ws');

export type TaskMonitorEventType = 
  | "todo_created"
  | "todo_updated"
  | "todo_deleted"
  | "artifact_created"
  | "artifact_deleted"
  | "tool_call_created"
  | "tool_call_updated"
  | "trajectory_event_created";

export interface TaskMonitorEvent {
  type: TaskMonitorEventType;
  sessionId: string;
  payload: unknown;
  timestamp: number;
}

export interface TaskMonitorEventHandlers {
  onTodoCreated?: (todo: TodoItem) => void;
  onTodoUpdated?: (todo: TodoItem) => void;
  onTodoDeleted?: (id: string) => void;
  onArtifactCreated?: (artifact: Artifact) => void;
  onArtifactDeleted?: (id: string) => void;
  onToolCallCreated?: (toolCall: ToolCall) => void;
  onToolCallUpdated?: (toolCall: ToolCall) => void;
  onTrajectoryEventCreated?: (event: TrajectoryEvent) => void;
}

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

export type ToolCallStatus = 'running' | 'success' | 'error' | 'cancelled';
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

export interface TrajectoryTrace {
  traceId: string;
  eventCount: number;
  firstTs: string;
  lastTs: string;
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

export interface TrajectoryStats {
  totalEvents: number;
  totalTraces: number;
  byType: Record<string, number>;
  bySource: Record<string, number>;
  firstTs: string | null;
  lastTs: string | null;
}

export interface PreviewResult {
  type: 'text' | 'image';
  content: string;
  mimeType: string;
  fileName: string;
  size: number;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${TASK_MONITOR_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// ===================== Todo Items =====================

export async function getTodosBySession(
  sessionId: string,
  options?: {
    status?: TodoStatus;
    priority?: TodoPriority;
    sortBy?: 'created_at' | 'updated_at' | 'order_index' | 'priority';
    sortOrder?: 'asc' | 'desc';
  }
): Promise<{ data: TodoItem[] }> {
  const params = new URLSearchParams();
  if (options?.status) params.set('status', options.status);
  if (options?.priority) params.set('priority', options.priority);
  if (options?.sortBy) params.set('sortBy', options.sortBy);
  if (options?.sortOrder) params.set('sortOrder', options.sortOrder);
  const qs = params.toString();
  return request(`/todos/session/${encodeURIComponent(sessionId)}${qs ? `?${qs}` : ''}`);
}

export async function createTodo(input: {
  sessionId: string;
  text: string;
  status?: TodoStatus;
  source?: TodoSource;
  priority?: TodoPriority;
  orderIndex?: number;
}): Promise<{ data: TodoItem }> {
  return request('/todos', { method: 'POST', body: JSON.stringify(input) });
}

export async function createTodosBatch(
  sessionId: string,
  todos: Array<{ text: string; source?: TodoSource; priority?: TodoPriority }>
): Promise<{ data: TodoItem[] }> {
  return request('/todos/batch', {
    method: 'POST',
    body: JSON.stringify({ sessionId, todos }),
  });
}

export async function updateTodo(
  id: string,
  input: Partial<{
    text: string;
    status: TodoStatus;
    priority: TodoPriority;
    orderIndex: number;
  }>
): Promise<{ data: TodoItem }> {
  return request(`/todos/${id}`, { method: 'PUT', body: JSON.stringify(input) });
}

export async function updateTodoPriority(
  id: string,
  priority: TodoPriority
): Promise<{ data: TodoItem }> {
  return request(`/todos/${id}/priority`, {
    method: 'PUT',
    body: JSON.stringify({ priority }),
  });
}

export async function updateTodoOrder(
  id: string,
  orderIndex: number
): Promise<{ data: TodoItem }> {
  return request(`/todos/${id}/order`, {
    method: 'PUT',
    body: JSON.stringify({ orderIndex }),
  });
}

export async function reorderTodos(
  sessionId: string,
  orderedIds: string[]
): Promise<{ data: { success: boolean } }> {
  return request(`/todos/session/${encodeURIComponent(sessionId)}/reorder`, {
    method: 'POST',
    body: JSON.stringify({ orderedIds }),
  });
}

export async function deleteTodo(id: string): Promise<{ data: { success: boolean } }> {
  return request(`/todos/${id}`, { method: 'DELETE' });
}

export async function deleteTodosBatch(ids: string[]): Promise<{ data: { success: boolean; deleted: number } }> {
  return request('/todos/batch/delete', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
}

// ===================== Artifacts =====================

export async function getArtifactsBySession(
  sessionId: string,
  options?: {
    type?: string;
    search?: string;
    sortBy?: 'created_at' | 'file_size' | 'file_name';
    sortOrder?: 'asc' | 'desc';
  }
): Promise<{ data: Artifact[] }> {
  const params = new URLSearchParams();
  if (options?.type) params.set('type', options.type);
  if (options?.search) params.set('search', options.search);
  if (options?.sortBy) params.set('sortBy', options.sortBy);
  if (options?.sortOrder) params.set('sortOrder', options.sortOrder);
  const qs = params.toString();
  return request(`/artifacts/session/${encodeURIComponent(sessionId)}${qs ? `?${qs}` : ''}`);
}

export async function getArtifact(id: string): Promise<{ data: Artifact }> {
  return request(`/artifacts/${id}`);
}

export function getArtifactDownloadUrl(id: string): string {
  return `${TASK_MONITOR_BASE}/artifacts/${id}/download`;
}

export async function previewArtifact(id: string): Promise<{ data: PreviewResult }> {
  return request(`/artifacts/${id}/preview`);
}

export async function createArtifact(input: {
  sessionId: string;
  messageId: string;
  fileName: string;
  filePath: string;
  fileSize?: number;
  mimeType?: string;
  description?: string;
}): Promise<{ data: Artifact }> {
  return request('/artifacts', { method: 'POST', body: JSON.stringify(input) });
}

export async function deleteArtifact(id: string): Promise<{ data: { success: boolean } }> {
  return request(`/artifacts/${id}`, { method: 'DELETE' });
}

export async function deleteArtifactsBatch(ids: string[]): Promise<{ data: { success: boolean; deleted: number } }> {
  return request('/artifacts/batch/delete', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
}

// ===================== Tool Calls =====================

export async function getToolCallsBySession(
  sessionId: string,
  options?: {
    type?: ToolType;
    status?: ToolCallStatus;
    search?: string;
    sortBy?: 'started_at' | 'completed_at' | 'duration_ms' | 'tool_name';
    sortOrder?: 'asc' | 'desc';
  }
): Promise<{ data: ToolCall[] }> {
  const params = new URLSearchParams();
  if (options?.type) params.set('type', options.type);
  if (options?.status) params.set('status', options.status);
  if (options?.search) params.set('search', options.search);
  if (options?.sortBy) params.set('sortBy', options.sortBy);
  if (options?.sortOrder) params.set('sortOrder', options.sortOrder);
  const qs = params.toString();
  return request(`/tool-calls/session/${encodeURIComponent(sessionId)}${qs ? `?${qs}` : ''}`);
}

export async function getToolCall(id: string): Promise<{ data: ToolCall }> {
  return request(`/tool-calls/${id}`);
}

export async function getToolCallStats(sessionId: string): Promise<{ data: ToolCallStats }> {
  return request(`/tool-calls/session/${encodeURIComponent(sessionId)}/stats`);
}

// ===================== Trajectory =====================

export async function getTrajectoryBySession(sessionId: string): Promise<{ data: TrajectoryEvent[] }> {
  return request(`/trajectory/session/${encodeURIComponent(sessionId)}`);
}

export async function getSessionTraces(sessionId: string): Promise<{ data: TrajectoryTrace[] }> {
  return request(`/trajectory/session/${encodeURIComponent(sessionId)}/traces`);
}

export async function searchTrajectoryEvents(
  sessionId: string,
  keyword: string
): Promise<{ data: TrajectoryEvent[] }> {
  const params = new URLSearchParams({ keyword });
  return request(`/trajectory/session/${encodeURIComponent(sessionId)}/search?${params.toString()}`);
}

export async function getTrajectoryStats(sessionId: string): Promise<{ data: TrajectoryStats }> {
  return request(`/trajectory/session/${encodeURIComponent(sessionId)}/stats`);
}

export function getTrajectoryExportUrl(traceId: string): string {
  return `${TASK_MONITOR_BASE}/trajectory/export/${traceId}`;
}

// ===================== Utility Functions =====================

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const unitIndex = Math.min(i, units.length - 1);
  const value = bytes / Math.pow(1024, unitIndex);
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = seconds / 60;
  return `${minutes.toFixed(1)} min`;
}

export function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const oneDay = 24 * 60 * 60 * 1000;

  if (diff < oneDay && date.getDate() === now.getDate()) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  if (diff < 2 * oneDay) {
    return '昨天 ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }

  if (diff < 7 * oneDay) {
    const days = Math.floor(diff / oneDay);
    return `${days} 天前`;
  }

  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ===================== WebSocket Subscription =====================

interface WebSocketConnection {
  socket: WebSocket | null;
  sessionId: string;
  handlers: TaskMonitorEventHandlers;
  messageId: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
}

const connections = new Map<string, WebSocketConnection>();

function getWebSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}/gateway/ws`;
}

function createRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function subscribeToTaskMonitor(
  sessionId: string,
  handlers: TaskMonitorEventHandlers
): () => void {
  const existing = connections.get(sessionId);
  if (existing) {
    existing.handlers = { ...existing.handlers, ...handlers };
    return () => unsubscribeFromTaskMonitor(sessionId);
  }

  const socket = new WebSocket(getWebSocketUrl());
  const connection: WebSocketConnection = {
    socket,
    sessionId,
    handlers,
    messageId: 0,
    reconnectTimer: null,
  };

  connections.set(sessionId, connection);

  socket.onopen = () => {
    socket.send(JSON.stringify({
      type: 'request',
      id: createRequestId(),
      method: 'task-monitor.subscribe',
      params: { sessionId },
      timestamp: Date.now(),
    }));
  };

  socket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === 'event' && message.event?.startsWith('task-monitor:')) {
        const eventType = message.event.replace('task-monitor:', '') as TaskMonitorEventType;
        const data = message.data;
        handleTaskMonitorEvent(eventType, data, handlers);
      }
    } catch {
      // ignore
    }
  };

  socket.onerror = () => {
    scheduleReconnect(sessionId);
  };

  socket.onclose = () => {
    scheduleReconnect(sessionId);
  };

  return () => unsubscribeFromTaskMonitor(sessionId);
}

function scheduleReconnect(sessionId: string): void {
  const connection = connections.get(sessionId);
  if (!connection) return;

  if (connection.reconnectTimer) {
    clearTimeout(connection.reconnectTimer);
  }

  connection.reconnectTimer = setTimeout(() => {
    if (connections.has(sessionId)) {
      unsubscribeFromTaskMonitor(sessionId);
      const handlers = connections.get(sessionId)?.handlers || {};
      subscribeToTaskMonitor(sessionId, handlers);
    }
  }, 3000);
}

function handleTaskMonitorEvent(
  eventType: TaskMonitorEventType,
  data: { type: TaskMonitorEventType; sessionId: string; payload: unknown },
  handlers: TaskMonitorEventHandlers
): void {
  switch (eventType) {
    case 'todo_created':
      handlers.onTodoCreated?.(data.payload as TodoItem);
      break;
    case 'todo_updated':
      handlers.onTodoUpdated?.(data.payload as TodoItem);
      break;
    case 'todo_deleted':
      handlers.onTodoDeleted?.((data.payload as { id: string }).id);
      break;
    case 'artifact_created':
      handlers.onArtifactCreated?.(data.payload as Artifact);
      break;
    case 'artifact_deleted':
      handlers.onArtifactDeleted?.((data.payload as { id: string }).id);
      break;
    case 'tool_call_created':
      handlers.onToolCallCreated?.(data.payload as ToolCall);
      break;
    case 'tool_call_updated':
      handlers.onToolCallUpdated?.(data.payload as ToolCall);
      break;
    case 'trajectory_event_created':
      handlers.onTrajectoryEventCreated?.(data.payload as TrajectoryEvent);
      break;
  }
}

export function unsubscribeFromTaskMonitor(sessionId: string): void {
  const connection = connections.get(sessionId);
  if (!connection) return;

  if (connection.socket) {
    connection.socket.send(JSON.stringify({
      type: 'request',
      id: createRequestId(),
      method: 'task-monitor.unsubscribe',
      params: { sessionId },
      timestamp: Date.now(),
    }));
    connection.socket.close();
    connection.socket = null;
  }

  if (connection.reconnectTimer) {
    clearTimeout(connection.reconnectTimer);
    connection.reconnectTimer = null;
  }

  connections.delete(sessionId);
}

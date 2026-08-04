/**
 * Tasks Gateway Methods — 派生任务管理 RPC 方法
 *
 * 架构定位：
 * - 参考 openclaw/src/gateway/server-methods/tasks.ts
 * - 精简版：tasks.list / tasks.get / tasks.cancel 三个核心方法
 * - 内存存储任务记录（生产环境应使用 server/engine/tasks/runtime-internal.ts）
 * - 通过 recordTaskRun / updateTaskRun 供 chat / agent 模块登记任务
 */

import type { GatewayMethodContext } from './types.js';
import { getMethodRegistry } from './methodRegistry.js';
import { getWebSocketHub } from './webSocketHub.js';

type GatewayMethodRegistry = ReturnType<typeof getMethodRegistry>;

// 任务状态（与 openclaw TaskSummary 对齐）
export type TaskLedgerStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'timed_out'
  | 'cancelled';

// 内部任务记录
interface TaskRecord {
  taskId: string;
  runId?: string;
  agentId?: string;
  sessionKey?: string;
  childSessionKey?: string;
  ownerKey?: string;
  kind: string;
  runtime?: string;
  status: TaskLedgerStatus;
  title?: string;
  progressSummary?: string;
  terminalSummary?: string;
  error?: string;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  updatedAt: number;
  parentTaskId?: string;
  parentFlowId?: string;
  sourceId?: string;
}

// 内存任务存储（按 taskId 索引）
const tasks = new Map<string, TaskRecord>();
const MAX_TASKS = 1000;

function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function taskUpdatedAt(task: TaskRecord): number {
  return task.endedAt ?? task.startedAt ?? task.createdAt;
}

function sanitizeText(value: unknown, maxChars = 500): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > maxChars ? trimmed.slice(0, maxChars) + '…' : trimmed;
}

function toSummary(task: TaskRecord) {
  return {
    id: task.taskId,
    taskId: task.taskId,
    kind: task.kind,
    ...(task.runtime ? { runtime: task.runtime } : {}),
    status: task.status,
    ...(task.title ? { title: task.title } : {}),
    ...(task.agentId ? { agentId: task.agentId } : {}),
    ...(task.sessionKey ? { sessionKey: task.sessionKey } : {}),
    ...(task.childSessionKey ? { childSessionKey: task.childSessionKey } : {}),
    ...(task.ownerKey ? { ownerKey: task.ownerKey } : {}),
    ...(task.runId ? { runId: task.runId } : {}),
    ...(task.parentFlowId ? { flowId: task.parentFlowId } : {}),
    ...(task.parentTaskId ? { parentTaskId: task.parentTaskId } : {}),
    ...(task.sourceId ? { sourceId: task.sourceId } : {}),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    ...(task.startedAt !== undefined ? { startedAt: task.startedAt } : {}),
    ...(task.endedAt !== undefined ? { endedAt: task.endedAt } : {}),
    ...(task.progressSummary ? { progressSummary: task.progressSummary } : {}),
    ...(task.terminalSummary ? { terminalSummary: task.terminalSummary } : {}),
    ...(task.error ? { error: task.error } : {}),
  };
}

/**
 * 内部接口：登记一个任务运行（供 chatMethods / agent 模块调用）
 */
export function recordTaskRun(input: {
  runId?: string;
  agentId?: string;
  sessionKey?: string;
  childSessionKey?: string;
  ownerKey?: string;
  kind: string;
  runtime?: string;
  title?: string;
  parentTaskId?: string;
  parentFlowId?: string;
  sourceId?: string;
}): string {
  const taskId = generateTaskId();
  const now = Date.now();
  const record: TaskRecord = {
    taskId,
    runId: input.runId,
    agentId: input.agentId,
    sessionKey: input.sessionKey,
    childSessionKey: input.childSessionKey,
    ownerKey: input.ownerKey,
    kind: input.kind,
    runtime: input.runtime,
    status: 'running',
    title: sanitizeText(input.title),
    createdAt: now,
    startedAt: now,
    updatedAt: now,
    parentTaskId: input.parentTaskId,
    parentFlowId: input.parentFlowId,
    sourceId: input.sourceId,
  };
  tasks.set(taskId, record);
  // 限制内存增长
  if (tasks.size > MAX_TASKS) {
    const oldest = Array.from(tasks.values())
      .sort((a, b) => a.createdAt - b.createdAt)[0];
    if (oldest) tasks.delete(oldest.taskId);
  }
  return taskId;
}

/**
 * 内部接口：更新任务运行状态（供 chatMethods / agent 模块调用）
 */
export function updateTaskRun(taskId: string, patch: Partial<Pick<TaskRecord,
  'status' | 'progressSummary' | 'terminalSummary' | 'error' | 'endedAt'>>): boolean {
  const task = tasks.get(taskId);
  if (!task) return false;
  if (patch.status !== undefined) task.status = patch.status;
  if (patch.progressSummary !== undefined) task.progressSummary = sanitizeText(patch.progressSummary);
  if (patch.terminalSummary !== undefined) task.terminalSummary = sanitizeText(patch.terminalSummary);
  if (patch.error !== undefined) task.error = sanitizeText(patch.error, 1000);
  if (patch.endedAt !== undefined) task.endedAt = patch.endedAt;
  task.updatedAt = Date.now();
  if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled' || task.status === 'timed_out') {
    if (task.endedAt === undefined) task.endedAt = task.updatedAt;
  }
  return true;
}

// ========== Tasks List ==========

async function tasksList(params: unknown, _ctx: GatewayMethodContext) {
  const p = (params || {}) as {
    status?: TaskLedgerStatus | TaskLedgerStatus[];
    sessionKey?: string;
    agentId?: string;
    limit?: number;
    offset?: number;
  };

  const limit = typeof p.limit === 'number' && Number.isFinite(p.limit) && p.limit > 0
    ? Math.min(Math.floor(p.limit), 500)
    : 100;
  const offset = typeof p.offset === 'number' && Number.isFinite(p.offset) && p.offset > 0
    ? Math.floor(p.offset)
    : 0;

  const statusFilter = p.status
    ? new Set<TaskLedgerStatus>(Array.isArray(p.status) ? p.status : [p.status])
    : null;

  let list = Array.from(tasks.values());
  if (statusFilter) {
    list = list.filter((t) => statusFilter.has(t.status));
  }
  if (typeof p.sessionKey === 'string' && p.sessionKey.trim()) {
    const sk = p.sessionKey.trim();
    list = list.filter((t) => t.sessionKey === sk || t.childSessionKey === sk || t.ownerKey === sk);
  }
  if (typeof p.agentId === 'string' && p.agentId.trim()) {
    const aid = p.agentId.trim();
    list = list.filter((t) => t.agentId === aid);
  }

  list.sort((a, b) => taskUpdatedAt(b) - taskUpdatedAt(a));
  const total = list.length;
  const sliced = list.slice(offset, offset + limit);

  return {
    ok: true,
    tasks: sliced.map(toSummary),
    total,
    hasMore: offset + limit < total,
  };
}

// ========== Tasks Get ==========

async function tasksGet(params: unknown, _ctx: GatewayMethodContext) {
  const { taskId, id } = (params || {}) as { taskId?: string; id?: string };
  const lookupId = taskId ?? id;

  if (typeof lookupId !== 'string' || !lookupId.trim()) {
    return {
      ok: false,
      error: { code: 'INVALID_REQUEST', message: 'taskId is required' },
    };
  }

  const task = tasks.get(lookupId.trim());
  if (!task) {
    return {
      ok: false,
      error: { code: 'NOT_FOUND', message: `task not found: ${lookupId}` },
    };
  }

  return {
    ok: true,
    task: toSummary(task),
  };
}

// ========== Tasks Cancel ==========

async function tasksCancel(params: unknown, _ctx: GatewayMethodContext) {
  const { taskId, id, reason } = (params || {}) as {
    taskId?: string;
    id?: string;
    reason?: string;
  };
  const lookupId = taskId ?? id;

  if (typeof lookupId !== 'string' || !lookupId.trim()) {
    return {
      ok: false,
      error: { code: 'INVALID_REQUEST', message: 'taskId is required' },
    };
  }

  const task = tasks.get(lookupId.trim());
  if (!task) {
    return {
      ok: false,
      error: { code: 'NOT_FOUND', message: `task not found: ${lookupId}` },
    };
  }

  // 已终态：直接返回当前状态
  if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled' || task.status === 'timed_out') {
    return {
      ok: true,
      taskId: task.taskId,
      cancelled: false,
      status: task.status,
      reason: 'task already terminal',
    };
  }

  // 优先复用 chat.abort 取消关联的运行
  if (task.runId && (task.sessionKey || task.childSessionKey)) {
    try {
      const registry = getMethodRegistry();
      await registry.invoke('chat.abort', {
        sessionKey: task.childSessionKey ?? task.sessionKey,
        runId: task.runId,
      }, {
        requestId: `task_cancel_${Date.now()}`,
        timestamp: Date.now(),
      });
    } catch {
      // ignore abort errors — 仍标记任务为 cancelled
    }
  }

  const now = Date.now();
  task.status = 'cancelled';
  task.endedAt = now;
  task.updatedAt = now;
  if (reason) task.terminalSummary = sanitizeText(reason);

  // 广播 sessions.changed 触发客户端刷新
  try {
    getWebSocketHub().broadcastEvent('sessions.changed', {
      kind: 'task_cancelled',
      sessionKeys: task.sessionKey ? [task.sessionKey] : [],
      ts: now,
    });
  } catch {
    // ignore broadcast errors
  }

  return {
    ok: true,
    taskId: task.taskId,
    cancelled: true,
    status: task.status,
    endedAt: task.endedAt,
  };
}

/**
 * 注册所有 Tasks 域方法
 */
export function registerTasksMethods(registry: GatewayMethodRegistry): void {
  registry.register('tasks.list', tasksList);
  registry.register('tasks.get', tasksGet);
  registry.register('tasks.cancel', tasksCancel);
}

/**
 * tasks/types.ts — 任务管理系统核心类型定义
 *
 * 所有模块共享的类型与常量。保持纯类型 + 少量纯函数，无副作用，
 * 便于在 Node 与测试（jsdom）环境下安全引用。
 */

// ===================== 状态与优先级 =====================

export type TaskStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timeout';

export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

/** 优先级权重：数值越大越优先。 */
export const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/** 优先级从高到低的顺序。 */
export const PRIORITY_ORDER: TaskPriority[] = ['critical', 'high', 'medium', 'low'];

/** 将任意字符串解析为合法优先级，非法值降级为 medium。 */
export function normalizePriority(p: unknown): TaskPriority {
  if (p === 'critical' || p === 'high' || p === 'medium' || p === 'low') return p;
  return 'medium';
}

// ===================== 终态判定 =====================

const TERMINAL_STATUSES: ReadonlySet<TaskStatus> = new Set<TaskStatus>([
  'completed',
  'failed',
  'cancelled',
  'timeout',
]);

const ACTIVE_STATUSES: ReadonlySet<TaskStatus> = new Set<TaskStatus>([
  'queued',
  'running',
  'paused',
]);

/** 是否终态（不可再变更）。 */
export function isTerminalStatus(s: TaskStatus): boolean {
  return TERMINAL_STATUSES.has(s);
}

/** 是否活动态（占用资源或排队中）。 */
export function isActiveStatus(s: TaskStatus): boolean {
  return ACTIVE_STATUSES.has(s);
}

/** 是否可取消（非终态即可取消）。 */
export function isCancellableStatus(s: TaskStatus): boolean {
  return !isTerminalStatus(s);
}

/** 是否可暂停（仅 running 可暂停）。 */
export function isPausableStatus(s: TaskStatus): boolean {
  return s === 'running';
}

// ===================== 依赖 =====================

export type DependencyType =
  | 'finish_to_start'
  | 'start_to_start'
  | 'finish_to_finish'
  | 'start_to_finish';

/** 依赖关系：当前任务对 targetTaskId 的依赖类型。 */
export interface TaskDependency {
  /** 被依赖的任务 ID */
  taskId: string;
  /** 依赖类型 */
  type: DependencyType;
}

// ===================== 进度与结果 =====================

export interface TaskProgress {
  /** 进度百分比 0-100 */
  percent: number;
  /** 当前阶段名称 */
  phase?: string;
  /** 子任务进度聚合 */
  subtasks?: {
    total: number;
    completed: number;
    failed: number;
  };
  /** 人类可读消息 */
  message?: string;
}

export interface TaskResult {
  /** 终态状态 */
  status: TaskStatus;
  /** 成功输出 */
  output?: unknown;
  /** 失败原因 */
  error?: string;
  /** 执行耗时（ms） */
  durationMs: number;
  /** 尝试次数（含首次） */
  attempts: number;
  /** 开始时间 ISO */
  startedAt: string;
  /** 完成时间 ISO */
  completedAt: string;
}

// ===================== Task 主体 =====================

export interface Task {
  /** 唯一 ID */
  id: string;
  /** 任务名 */
  name: string;
  /** 任务描述 */
  description?: string;
  /** 当前状态 */
  status: TaskStatus;
  /** 优先级 */
  priority: TaskPriority;
  /** 前置任务 ID 列表（finish_to_start 语义） */
  dependencies: string[];
  /** 业务载荷 */
  payload?: unknown;
  /** 超时毫秒（0 = 不限制） */
  timeoutMs: number;
  /** 最大重试次数 */
  maxRetries: number;
  /** 已重试次数 */
  retryCount: number;
  /** 标签 */
  tags: string[];
  /** 自定义元数据 */
  metadata: Record<string, unknown>;
  /** 创建时间 ISO */
  createdAt: string;
  /** 排队时间 ISO */
  queuedAt: string | null;
  /** 开始执行时间 ISO */
  startedAt: string | null;
  /** 完成时间 ISO */
  completedAt: string | null;
  /** 当前进度 */
  progress: TaskProgress | null;
  /** 执行结果 */
  result: TaskResult | null;
  /** 错误信息（运行态） */
  error: string | null;
}

/** 创建任务时使用的选项（id/时间戳/status 由 store 补全）。 */
export interface TaskOptions {
  id?: string;
  name: string;
  description?: string;
  priority?: TaskPriority;
  dependencies?: string[];
  payload?: unknown;
  timeoutMs?: number;
  maxRetries?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

// ===================== 事件 =====================

export type TaskEventType =
  | 'task:created'
  | 'task:queued'
  | 'task:started'
  | 'task:paused'
  | 'task:resumed'
  | 'task:progress'
  | 'task:completed'
  | 'task:failed'
  | 'task:cancelled'
  | 'task:timeout'
  | 'task:retried'
  | 'task:dependency:resolved';

export interface TaskEvent {
  type: TaskEventType;
  taskId: string;
  timestamp: string;
  data?: unknown;
}

// ===================== 执行上下文与处理器 =====================

export interface TaskExecutionContext {
  taskId: string;
  /** 取消信号 */
  signal: AbortSignal;
  /** 主动取消 */
  cancel: (reason?: string) => void;
  /** 上报进度 */
  reportProgress: (progress: Partial<TaskProgress>) => void;
  /** 是否已取消 */
  isCancelled: () => boolean;
  /** 当前尝试次数（1 起） */
  attempt: number;
}

/** 任务处理器：返回任意可序列化输出。 */
export type TaskHandler = (task: Task, ctx: TaskExecutionContext) => Promise<unknown>;

export type TaskHandlerFactory = (task: Task) => TaskHandler | null;

// ===================== 钩子 =====================

export type TaskHookName =
  | 'beforeCreate'
  | 'afterCreate'
  | 'beforeStart'
  | 'afterStart'
  | 'beforeComplete'
  | 'afterComplete'
  | 'beforeCancel'
  | 'afterCancel'
  | 'onError';

export interface TaskHookContext {
  task: Task;
  error?: Error;
  result?: TaskResult;
}

export type TaskHookFn = (ctx: TaskHookContext) => void | Promise<void>;

// ===================== 工具函数 =====================

let __seq = 0;

/** 生成任务 ID：ts 前缀 + 自增序列，保证同进程内单调。 */
export function genTaskId(prefix = 'task'): string {
  __seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${__seq.toString(36)}`;
}

/** 当前时间 ISO 字符串。 */
export function nowIso(): string {
  return new Date().toISOString();
}

/** 限制 percent 在 [0,100]。 */
export function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n);
}

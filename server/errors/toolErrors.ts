/**
 * Tool Errors — 工具执行稳定性链路统一错误类型
 *
 * P1-3: 将稳定性链路中各模块抛出的错误统一为真正的 class，
 * 支持 instanceof 类型守卫，避免依赖字符串匹配（err.name === 'ToolTimeoutError'）。
 *
 * 替代原先的 `new Error(msg); err.name = 'ToolTimeoutError'` 模式。
 */

// ===================== 基类 =====================

/**
 * 所有工具执行稳定性错误的基类
 * 通过 instanceof 即可判断是否来自稳定性链路
 */
export class ToolError extends Error {
  /** 工具名 */
  readonly toolName: string;
  /** 错误类别（用于 stats/audit 分类） */
  readonly category: 'timeout' | 'abort' | 'queue' | 'execution';

  constructor(message: string, toolName: string, category: ToolError['category']) {
    super(message);
    this.name = this.constructor.name;
    this.toolName = toolName;
    this.category = category;
  }
}

// ===================== 具体错误类型 =====================

/**
 * 工具执行超时错误
 * - 由 toolTimeoutWrapper 抛出
 * - retryWrapper 可通过 instanceof 判断是否为瞬时错误
 */
export class ToolTimeoutError extends ToolError {
  /** 配置的超时值（毫秒） */
  readonly timeoutMs: number;

  constructor(toolName: string, timeoutMs: number, cause?: unknown) {
    super(`工具 '${toolName}' 执行超时（${timeoutMs}ms）`, toolName, 'timeout');
    this.timeoutMs = timeoutMs;
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }
}

/**
 * 工具执行取消错误（用户取消 / 父级 abort 级联）
 * - 由 toolTimeoutWrapper 抛出
 * - 不应触发 retry（非瞬时错误）
 */
export class ToolAbortError extends ToolError {
  /** 取消原因（user_cancel / cascaded / external） */
  readonly abortReason: string;

  constructor(toolName: string, abortReason: string = 'cascaded', cause?: unknown) {
    super(`工具 '${toolName}' 执行已取消`, toolName, 'abort');
    this.abortReason = abortReason;
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }
}

/**
 * 队列超时错误 — 任务在队列中等待过久
 * - 由 toolExecutionQueue 抛出
 */
export class QueueTimeoutError extends ToolError {
  /** 队列超时配置值（毫秒） */
  readonly queueTimeoutMs: number;

  constructor(toolName: string, queueTimeoutMs: number) {
    super(
      `工具 '${toolName}' 队列等待超时（${queueTimeoutMs}ms）`,
      toolName,
      'queue',
    );
    this.queueTimeoutMs = queueTimeoutMs;
  }
}

/**
 * 队列取消错误 — 任务被取消或队列被清空
 * - 由 toolExecutionQueue 抛出
 */
export class QueueCancelledError extends ToolError {
  constructor(toolName: string, reason: string = 'cancelled') {
    super(`工具 '${toolName}' 队列任务被${reason}`, toolName, 'queue');
  }
}

/**
 * 队列已满错误 — 队列达到最大长度，拒绝新任务
 * - 由 toolExecutionQueue 抛出（如果配置了 maxQueueLength）
 */
export class QueueFullError extends ToolError {
  readonly queueLength: number;
  readonly maxQueueLength: number;

  constructor(toolName: string, queueLength: number, maxQueueLength: number) {
    super(
      `工具 '${toolName}' 队列已满（${queueLength}/${maxQueueLength}）`,
      toolName,
      'queue',
    );
    this.queueLength = queueLength;
    this.maxQueueLength = maxQueueLength;
  }
}

// ===================== 类型守卫 =====================

/** 判断是否为工具超时错误 */
export function isToolTimeoutError(err: unknown): err is ToolTimeoutError {
  return err instanceof ToolTimeoutError;
}

/** 判断是否为工具取消错误 */
export function isToolAbortError(err: unknown): err is ToolAbortError {
  return err instanceof ToolAbortError;
}

/** 判断是否为队列错误 */
export function isQueueError(err: unknown): err is QueueTimeoutError | QueueCancelledError | QueueFullError {
  return err instanceof QueueTimeoutError ||
    err instanceof QueueCancelledError ||
    err instanceof QueueFullError;
}

/** 判断是否为可重试的瞬时错误（超时 + 队列超时） */
export function isTransientToolError(err: unknown): boolean {
  return err instanceof ToolTimeoutError || err instanceof QueueTimeoutError;
}

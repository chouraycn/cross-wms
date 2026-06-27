/**
 * Reply Coalescer
 * 回复合并器 - 聚合流式事件，按帧批量刷新，减少渲染抖动
 */

import type { ReplyCoalescedUpdate, ReplyCoalescerFlushHandler } from "./types.js";

export type CoalescerPriority = "high" | "medium" | "low";

export interface CoalescerOptions {
  priority?: CoalescerPriority;
  maxDelayMs?: number;
  maxUpdatesPerFlush?: number;
  flushOnTerminalEvent?: boolean;
  name?: string;
}

const PRIORITY_DELAYS: Record<CoalescerPriority, number> = {
  high: 16,
  medium: 50,
  low: 200,
};

const DEFAULT_MAX_UPDATES_PER_FLUSH = 100;

/**
 * 回复合并器 - 用于缓冲流式更新并批量刷新
 */
export class ReplyCoalescer {
  private readonly buffer: ReplyCoalescedUpdate[] = [];
  private readonly flushHandler: ReplyCoalescerFlushHandler;
  private readonly priority: CoalescerPriority;
  private readonly maxDelayMs: number;
  private readonly maxUpdatesPerFlush: number;
  private readonly flushOnTerminalEvent: boolean;
  private readonly name: string;

  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;
  private lastFlushAt = 0;
  private totalUpdates = 0;
  private totalFlushes = 0;

  constructor(flushHandler: ReplyCoalescerFlushHandler, options: CoalescerOptions = {}) {
    this.flushHandler = flushHandler;
    this.priority = options.priority ?? "medium";
    this.maxDelayMs = options.maxDelayMs ?? PRIORITY_DELAYS[this.priority];
    this.maxUpdatesPerFlush = options.maxUpdatesPerFlush ?? DEFAULT_MAX_UPDATES_PER_FLUSH;
    this.flushOnTerminalEvent = options.flushOnTerminalEvent ?? true;
    this.name = options.name ?? "coalescer";
  }

  /**
   * 添加更新到缓冲区
   */
  push(update: ReplyCoalescedUpdate): void {
    this.buffer.push(update);
    this.totalUpdates++;

    // 终端事件立即刷新
    const isTerminal =
      update.type === "text" &&
      typeof update.content === "string" &&
      update.content.endsWith(""); // 简化判断

    if (this.flushOnTerminalEvent && isTerminal) {
      this.scheduleFlush(0);
      return;
    }

    // 达到最大更新数时刷新
    if (this.buffer.length >= this.maxUpdatesPerFlush) {
      this.scheduleFlush(0);
      return;
    }

    this.scheduleFlush(this.maxDelayMs);
  }

  /**
   * 批量添加更新
   */
  pushBulk(updates: ReplyCoalescedUpdate[]): void {
    this.buffer.push(...updates);
    this.totalUpdates += updates.length;

    if (this.buffer.length >= this.maxUpdatesPerFlush) {
      this.scheduleFlush(0);
      return;
    }

    this.scheduleFlush(this.maxDelayMs);
  }

  /**
   * 强制立即刷新
   */
  async flush(): Promise<void> {
    if (this.flushing) {
      return;
    }

    this.clearTimer();

    if (this.buffer.length === 0) {
      return;
    }

    this.flushing = true;
    const updates = this.buffer.splice(0, this.buffer.length);

    try {
      await Promise.resolve(this.flushHandler(updates));
      this.lastFlushAt = Date.now();
      this.totalFlushes++;
    } finally {
      this.flushing = false;
    }

    // 如果还有剩余更新，继续调度
    if (this.buffer.length > 0) {
      this.scheduleFlush(this.maxDelayMs);
    }
  }

  /**
   * 强制刷新所有待处理更新（同步）
   */
  flushSync(): void {
    this.clearTimer();

    if (this.buffer.length === 0) {
      return;
    }

    const updates = this.buffer.splice(0, this.buffer.length);
    try {
      this.flushHandler(updates);
    } catch (e) {
      // 忽略同步刷新错误
    }
    this.lastFlushAt = Date.now();
    this.totalFlushes++;
  }

  /**
   * 清空缓冲区
   */
  clear(): void {
    this.clearTimer();
    this.buffer.length = 0;
  }

  /**
   * 销毁合并器
   */
  dispose(): void {
    this.clearTimer();
    this.buffer.length = 0;
  }

  /**
   * 获取当前缓冲区大小
   */
  get bufferSize(): number {
    return this.buffer.length;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalUpdates: number;
    totalFlushes: number;
    currentBufferSize: number;
    lastFlushAt: number;
    priority: CoalescerPriority;
  } {
    return {
      totalUpdates: this.totalUpdates,
      totalFlushes: this.totalFlushes,
      currentBufferSize: this.buffer.length,
      lastFlushAt: this.lastFlushAt,
      priority: this.priority,
    };
  }

  private scheduleFlush(delayMs: number): void {
    if (this.flushTimer) {
      return;
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, delayMs);
  }

  private clearTimer(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }
}

/**
 * 双缓冲合并器 - 主文本和思考流使用独立缓冲区
 */
export class DualCoalescer {
  readonly main: ReplyCoalescer;
  readonly thinking: ReplyCoalescer;

  constructor(
    mainHandler: ReplyCoalescerFlushHandler,
    thinkingHandler: ReplyCoalescerFlushHandler,
    options?: {
      mainPriority?: CoalescerPriority;
      thinkingPriority?: CoalescerPriority;
    },
  ) {
    this.main = new ReplyCoalescer(mainHandler, {
      priority: options?.mainPriority ?? "high",
      name: "main",
    });
    this.thinking = new ReplyCoalescer(thinkingHandler, {
      priority: options?.thinkingPriority ?? "low",
      name: "thinking",
    });
  }

  /**
   * 推送主文本更新
   */
  pushMain(text: string): void {
    this.main.push({
      type: "text",
      content: text,
      timestamp: Date.now(),
    });
  }

  /**
   * 推送思考更新
   */
  pushThinking(text: string): void {
    this.thinking.push({
      type: "thinking",
      content: text,
      timestamp: Date.now(),
    });
  }

  /**
   * 推送工具调用
   */
  pushToolCall(id: string, name: string, input: string): void {
    this.main.push({
      type: "tool_call",
      toolCallId: id,
      toolName: name,
      toolInput: input,
      timestamp: Date.now(),
    });
  }

  /**
   * 推送工具结果
   */
  pushToolResult(id: string, result: unknown, isError = false): void {
    this.main.push({
      type: "tool_result",
      toolCallId: id,
      toolResult: result,
      isError,
      timestamp: Date.now(),
    });
  }

  /**
   * 强制刷新所有缓冲区
   */
  async flushAll(): Promise<void> {
    await Promise.all([this.main.flush(), this.thinking.flush()]);
  }

  /**
   * 同步刷新所有缓冲区
   */
  flushAllSync(): void {
    this.main.flushSync();
    this.thinking.flushSync();
  }

  /**
   * 清空所有缓冲区
   */
  clearAll(): void {
    this.main.clear();
    this.thinking.clear();
  }

  /**
   * 销毁
   */
  dispose(): void {
    this.main.dispose();
    this.thinking.dispose();
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    main: ReturnType<ReplyCoalescer["getStats"]>;
    thinking: ReturnType<ReplyCoalescer["getStats"]>;
  } {
    return {
      main: this.main.getStats(),
      thinking: this.thinking.getStats(),
    };
  }
}

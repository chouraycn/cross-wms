/**
 * 压缩 Hook 系统 — 基于 OpenClaw Compaction Hooks
 *
 * 核心功能：
 * - 支持压缩前后的钩子回调
 * - before-compact 钩子可中止压缩
 * - after-compact 钩子可修改压缩结果
 * - compact-failed 钩子处理压缩失败
 */

import type { TokenBudgetSnapshot } from './tokenBudget.js';

// ===================== 类型定义 =====================

/** Hook 类型 */
export type CompactionHookType =
  | 'before-compact'
  | 'after-compact'
  | 'compact-failed';

/** 压缩触发方式 */
export type CompactionTrigger = 'manual' | 'budget' | 'overflow' | 'preemptive' | 'timeout';

/** Hook 上下文 */
export interface CompactionHookContext {
  /** 会话键 */
  sessionKey: string;
  /** 触发方式 */
  trigger: CompactionTrigger;
  /** 当前 Token 预算快照 */
  budgetSnapshot?: TokenBudgetSnapshot;
  /** 压缩前消息数量 */
  messageCount: number;
  /** 压缩前 Token 数量 */
  tokenCount: number;
  /** 时间戳 */
  timestamp: number;
  /** 中止信号（仅 before-compact 钩子可用） */
  abortSignal?: CompactionAbortSignal;
}

/** after-compact Hook 上下文（扩展） */
export interface AfterCompactHookContext extends CompactionHookContext {
  /** 压缩后消息数量 */
  compactedMessageCount: number;
  /** 压缩后 Token 数量 */
  compactedTokenCount: number;
  /** 压缩摘要 */
  summary?: string;
  /** Token 减少量 */
  tokenReduction: number;
  /** 压缩耗时（毫秒） */
  durationMs: number;
}

/** compact-failed Hook 上下文（扩展） */
export interface CompactFailedHookContext extends CompactionHookContext {
  /** 错误信息 */
  error: string;
  /** 错误码 */
  errorCode?: string;
  /** 重试次数 */
  retryCount: number;
}

/** Hook 回调函数 */
export type CompactionHookFn<T extends CompactionHookContext = CompactionHookContext> = (
  ctx: T,
) => void | Promise<void>;

/** before-compact Hook 的中止信号 */
export class CompactionAbortSignal {
  private aborted: boolean = false;
  private reason: string = '';

  /** 中止压缩 */
  abort(reason: string): void {
    this.aborted = true;
    this.reason = reason;
  }

  /** 是否已中止 */
  isAborted(): boolean {
    return this.aborted;
  }

  /** 获取中止原因 */
  getReason(): string {
    return this.reason;
  }
}

// ===================== CompactionHooks =====================

export class CompactionHooks {
  private hooks: Map<CompactionHookType, Array<CompactionHookFn>> = new Map();

  /** 注册 Hook */
  register(type: CompactionHookType, fn: CompactionHookFn): () => void {
    if (!this.hooks.has(type)) {
      this.hooks.set(type, []);
    }
    this.hooks.get(type)!.push(fn);

    // 返回取消注册函数
    return () => {
      const list = this.hooks.get(type);
      if (list) {
        const index = list.indexOf(fn);
        if (index >= 0) list.splice(index, 1);
      }
    };
  }

  /** 运行 before-compact Hook（支持中止） */
  async runBeforeCompact(ctx: CompactionHookContext): Promise<CompactionAbortSignal> {
    const signal = new CompactionAbortSignal();
    const fns = this.hooks.get('before-compact') ?? [];

    for (const fn of fns) {
      if (signal.isAborted()) break;
      try {
        await fn({ ...ctx, abortSignal: signal });
      } catch (err) {
        // Hook 执行失败不阻塞压缩流程
      }
    }

    return signal;
  }

  /** 运行 after-compact Hook */
  async runAfterCompact(ctx: AfterCompactHookContext): Promise<void> {
    const fns = this.hooks.get('after-compact') ?? [];

    for (const fn of fns) {
      try {
        await fn(ctx);
      } catch (err) {
        // Hook 执行失败不阻塞
      }
    }
  }

  /** 运行 compact-failed Hook */
  async runCompactFailed(ctx: CompactFailedHookContext): Promise<void> {
    const fns = this.hooks.get('compact-failed') ?? [];

    for (const fn of fns) {
      try {
        await fn(ctx);
      } catch (err) {
        // Hook 执行失败不阻塞
      }
    }
  }

  /** 移除指定类型的所有 Hook */
  removeAll(type: CompactionHookType): void {
    this.hooks.delete(type);
  }

  /** 获取指定类型的 Hook 数量 */
  getHookCount(type: CompactionHookType): number {
    return this.hooks.get(type)?.length ?? 0;
  }
}

export const compactionHooks = new CompactionHooks();

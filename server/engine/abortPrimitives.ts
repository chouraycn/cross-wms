/**
 * Abort Primitives — 系统化中止原语
 *
 * 提供多层级的中止控制：
 * 1. Run-level abort：整个对话运行级别中止
 * 2. Turn-level abort：单轮对话级别中止
 * 3. Tool-level abort：单个工具调用级别中止
 * 4. 组合信号：将多个 AbortSignal 合并为一个
 * 5. 超时信号：在指定时间后自动中止
 * 6. 手动取消：用户主动取消
 *
 * 参考: openclaw/src/auto-reply/reply/abort.ts, abort-primitives.ts, abort-cutoff.ts
 *
 * v11.1: 新增系统化 abort 原语
 */

import { logger } from '../logger.js';

// ===================== 类型定义 =====================

export type AbortReason = 'user_cancel' | 'timeout' | 'error' | 'resource_limit' | 'cascaded';

export interface AbortContext {
  reason: AbortReason;
  source: string;
  timestamp: number;
  message?: string;
}

export interface ManagedAbortController extends AbortController {
  readonly id: string;
  readonly context: AbortContext;
  readonly parent?: ManagedAbortController;
  readonly children: Set<ManagedAbortController>;
  abortReason?: AbortContext;
  /** P0: 清理函数列表 — 存储 listener removeEventListener 和 clearTimeout 的清理逻辑，在 release/abort 时执行 */
  cleanupFns?: (() => void)[];
}

// ===================== 状态 =====================

class AbortPrimitivesManager {
  private controllers: Map<string, ManagedAbortController> = new Map();
  private rootControllers: Map<string, ManagedAbortController> = new Map();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private static readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 分钟

  /**
   * 创建受管理的 AbortController
   */
  createController(
    id: string,
    context: AbortContext,
    parent?: ManagedAbortController,
  ): ManagedAbortController {
    const baseController = new AbortController();
    const controller: ManagedAbortController = Object.assign(baseController, {
      id,
      context,
      parent,
      children: new Set<ManagedAbortController>(),
    });

    this.controllers.set(id, controller);

    if (parent) {
      parent.children.add(controller);
      // P0: 父级中止时，子级也中止 — 存储 listener 以便在 release/abort 时清理
      const parentListener = () => {
        if (!controller.signal.aborted) {
          controller.abortReason = {
            reason: 'cascaded',
            source: parent.id,
            timestamp: Date.now(),
            message: `Cascade abort from parent ${parent.id}`,
          };
          controller.abort();
        }
      };
      parent.signal.addEventListener('abort', parentListener);
      controller.cleanupFns = [() => parent.signal.removeEventListener('abort', parentListener)];
    } else {
      // 根控制器
      this.rootControllers.set(id, controller);
    }

    logger.debug(`[AbortPrimitives] Created controller: ${id} (reason=${context.reason})`);
    return controller;
  }

  /**
   * 创建带超时的 AbortController
   */
  createTimeoutController(
    id: string,
    timeoutMs: number,
    parent?: ManagedAbortController,
  ): ManagedAbortController {
    const controller = this.createController(id, {
      reason: 'timeout',
      source: id,
      timestamp: Date.now(),
      message: `Timeout after ${timeoutMs}ms`,
    }, parent);

    // P0: 存储 timeout handle 以便在 release/abort 时清理，防止定时器泄漏
    const timeoutHandle = setTimeout(() => {
      if (!controller.signal.aborted) {
        controller.abortReason = {
          reason: 'timeout',
          source: id,
          timestamp: Date.now(),
          message: `Timeout after ${timeoutMs}ms`,
        };
        controller.abort();
      }
    }, timeoutMs);
    if (!controller.cleanupFns) controller.cleanupFns = [];
    controller.cleanupFns.push(() => clearTimeout(timeoutHandle));

    return controller;
  }

  /**
   * 组合多个 AbortSignal 为一个
   */
  combineSignals(signals: AbortSignal[], fallbackId: string): AbortSignal {
    if (signals.length === 0) {
      return new AbortController().signal;
    }
    if (signals.length === 1) {
      return signals[0];
    }
    return AbortSignal.any(signals);
  }

  /**
   * 中止控制器及其所有子控制器
   */
  abort(id: string, reason: AbortContext): void {
    const controller = this.controllers.get(id);
    if (!controller) {
      logger.warn(`[AbortPrimitives] Controller not found: ${id}`);
      return;
    }

    // 中止所有子控制器
    for (const child of controller.children) {
      this.abort(child.id, {
        reason: 'cascaded',
        source: id,
        timestamp: Date.now(),
        message: `Cascade abort from ${id}`,
      });
    }

    // 中止自身
    if (!controller.signal.aborted) {
      controller.abortReason = reason;
      controller.abort();
      logger.info(
        `[AbortPrimitives] Aborted: ${id} (reason=${reason.reason}, source=${reason.source})`
      );
    }

    // P0: 执行清理函数（移除 listeners、清除 timers）
    this.runCleanup(controller);

    // 只从 rootControllers 中删除（已中止的根不再需要被 abortAll 遍历）
    // 不从 controllers 中删除 — 让 cleanup() 定时清理，调用方可在 abort 后查询 getAbortReason()
    this.rootControllers.delete(id);
  }

  /**
   * P0: 执行控制器的清理函数 — 移除 event listeners、清除 timers
   * 防止资源泄漏（MaxListenersExceededWarning + 定时器泄漏）
   */
  private runCleanup(controller: ManagedAbortController): void {
    if (controller.cleanupFns && controller.cleanupFns.length > 0) {
      for (const fn of controller.cleanupFns) {
        try { fn(); } catch { /* ignore cleanup errors */ }
      }
      controller.cleanupFns = [];
    }
  }

  /**
   * 获取控制器
   */
  getController(id: string): ManagedAbortController | undefined {
    return this.controllers.get(id);
  }

  /**
   * 获取根控制器
   */
  getRootController(id: string): ManagedAbortController | undefined {
    return this.rootControllers.get(id);
  }

  /**
   * 检查是否已中止
   */
  isAborted(id: string): boolean {
    const controller = this.controllers.get(id);
    return controller?.signal.aborted ?? false;
  }

  /**
   * 获取中止原因
   */
  getAbortReason(id: string): AbortContext | undefined {
    const controller = this.controllers.get(id);
    return controller?.abortReason;
  }

  /**
   * 清理已完成的控制器
   */
  cleanup(): number {
    let cleaned = 0;
    for (const [id, controller] of this.controllers) {
      if (controller.signal.aborted) {
        // P0: 清理 listeners 和 timers（已中止的控制器可能残留清理函数）
        this.runCleanup(controller);
        this.controllers.delete(id);
        this.rootControllers.delete(id);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      logger.debug(`[AbortPrimitives] Cleaned ${cleaned} aborted controllers`);
    }
    return cleaned;
  }

  /**
   * 启动定时自动清理（防止已完成的控制器累积导致内存泄漏）
   * 在 server 启动时调用一次即可。
   */
  startAutoCleanup(): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, AbortPrimitivesManager.CLEANUP_INTERVAL_MS);
    // unref: 不阻止 Node 进程退出
    if (typeof this.cleanupTimer.unref === 'function') {
      this.cleanupTimer.unref();
    }
    logger.debug('[AbortPrimitives] Auto cleanup timer started');
  }

  /**
   * 释放受管资源（shutdown 时调用）：
   * 1. 中止所有仍在运行根控制器
   * 2. 清空 Map
   * 3. 停止定时器
   */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    // 中止所有根控制器（级联到子控制器）
    this.abortAll('resource_limit');
    // 清空残留
    this.controllers.clear();
    this.rootControllers.clear();
    logger.debug('[AbortPrimitives] Disposed');
  }

  /**
   * 静默释放控制器（用于运行结束后的清理）：
   * - 若控制器仍存在：中止自身及子级，并从 Map 删除
   * - 若已不存在（如已被外部 signal 中止）：静默返回，不打印 warning
   * 与 abort() 的区别：abort() 在找不到时会 warn，release() 不会
   */
  release(id: string): void {
    const controller = this.controllers.get(id);
    if (!controller) return;
    // 中止子级（级联）
    for (const child of controller.children) {
      this.release(child.id);
    }
    // 中止自身（若尚未中止）
    if (!controller.signal.aborted) {
      controller.abortReason = {
        reason: 'resource_limit',
        source: 'release',
        timestamp: Date.now(),
        message: 'Released by caller',
      };
      controller.abort();
    }
    // P0: 执行清理函数（移除 listeners、清除 timers）
    this.runCleanup(controller);
    this.controllers.delete(id);
    this.rootControllers.delete(id);
  }

  /**
   * 中止所有根控制器
   * P2-6: 使用 keys 快照避免迭代中删除导致跳过
   */
  abortAll(reason: AbortReason = 'user_cancel'): void {
    const ids = Array.from(this.rootControllers.keys());
    for (const id of ids) {
      const controller = this.rootControllers.get(id);
      if (controller && !controller.signal.aborted) {
        this.abort(id, {
          reason,
          source: 'system',
          timestamp: Date.now(),
          message: 'Abort all',
        });
      }
    }
  }
}

// ===================== 导出 =====================

export const abortPrimitives = new AbortPrimitivesManager();

/**
 * 创建运行级别的中止控制器
 */
export function createRunAbortController(runId: string): ManagedAbortController {
  return abortPrimitives.createController(`run:${runId}`, {
    reason: 'user_cancel',
    source: runId,
    timestamp: Date.now(),
  });
}

/**
 * 创建工具级别的中止控制器
 */
export function createToolAbortController(
  toolCallId: string,
  runController: ManagedAbortController,
  timeoutMs?: number,
): ManagedAbortController {
  if (timeoutMs) {
    return abortPrimitives.createTimeoutController(
      `tool:${toolCallId}`,
      timeoutMs,
      runController,
    );
  }
  return abortPrimitives.createController(
    `tool:${toolCallId}`,
    {
      reason: 'user_cancel',
      source: toolCallId,
      timestamp: Date.now(),
    },
    runController,
  );
}

/**
 * 将外部 signal 转换为受管理的 controller
 */
export function linkExternalSignal(
  id: string,
  externalSignal: AbortSignal,
): ManagedAbortController {
  const controller = abortPrimitives.createController(id, {
    reason: 'cascaded',
    source: 'external',
    timestamp: Date.now(),
  });

  // P0: 存储 listener 以便在 release/abort 时清理，防止外部 signal 上 listener 堆积
  const externalListener = () => {
    abortPrimitives.abort(id, {
      reason: 'cascaded',
      source: 'external',
      timestamp: Date.now(),
      message: 'External signal aborted',
    });
  };
  externalSignal.addEventListener('abort', externalListener);
  if (!controller.cleanupFns) controller.cleanupFns = [];
  controller.cleanupFns.push(() => externalSignal.removeEventListener('abort', externalListener));

  return controller;
}
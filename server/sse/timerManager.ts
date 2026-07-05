/**
 * TimerManager — 统一 Timer 管理
 *
 * 封装 keepAliveTimer 的启动/清理/降级重启，消除散落在各处的
 * 4 处启动 + 8 处清理的定时器管理代码。
 *
 * 核心特性：
 * - start(module) / stop(module) / stopAll() 三方法管理
 * - 自动防泄漏：stopAll 在 finally 中调用
 * - 使用 sendDebugSSE 发送 keep_alive（合并到 debug 通道）
 * - 降级重启：stop(module) 后可再次 start(module) 重启心跳
 */

import type { Response } from 'express';
import { sendDebugSSE } from './sseTypes.js';
import { logger } from '../logger.js';

/** keep_alive 间隔（毫秒） */
const KEEP_ALIVE_INTERVAL_MS = 5000;

/** 单个模块的定时器状态 */
interface TimerState {
  timer: NodeJS.Timeout;
  startTime: number;
}

/**
 * 统一 Timer 管理器
 *
 * 管理多个模块的 keepAliveTimer，支持按模块名启动/停止。
 * 每个模块独立维护一个定时器，stopAll 可一次性清理所有。
 */
export class TimerManager {
  private timers: Map<string, TimerState> = new Map();
  private res?: Response;

  constructor(res?: Response) {
    this.res = res;
  }

  /**
   * 启动指定模块的 keepAliveTimer
   *
   * @param module 模块标识（如 'main', 'fallback', 'queue'）
   * @returns 启动的定时器引用（可用于外部清理）
   */
  start(module: string): NodeJS.Timeout {
    // 如果该模块已有定时器在运行，先停止
    this.stop(module);

    const startTime = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      if (this.res) {
        sendDebugSSE(this.res, { type: 'keep_alive', elapsed, module });
      }
    }, KEEP_ALIVE_INTERVAL_MS);

    this.timers.set(module, { timer, startTime });
    logger.debug(`[TimerManager] 启动 keepAlive: module=${module}`);
    return timer;
  }

  /**
   * 停止指定模块的 keepAliveTimer
   *
   * @param module 模块标识
   */
  stop(module: string): void {
    const state = this.timers.get(module);
    if (state) {
      clearInterval(state.timer);
      this.timers.delete(module);
      logger.debug(`[TimerManager] 停止 keepAlive: module=${module}`);
    }
  }

  /**
   * 停止所有 keepAliveTimer
   *
   * 应在 finally 块中调用，确保所有定时器被清理。
   */
  stopAll(): void {
    for (const [module, state] of this.timers) {
      clearInterval(state.timer);
      logger.debug(`[TimerManager] stopAll 清理: module=${module}`);
    }
    this.timers.clear();
  }

  /**
   * 降级重启 — 停止指定模块后重新启动
   *
   * 用于降级模型场景：先停止原模型的心跳，再以新的起始时间重启。
   *
   * @param module 模块标识
   */
  restart(module: string): void {
    this.start(module);
  }

  /**
   * 检查指定模块的定时器是否活跃
   */
  isActive(module: string): boolean {
    return this.timers.has(module);
  }
}

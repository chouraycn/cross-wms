/**
 * 定时器统一管理器
 *
 * 参考 OpenClaw 的 WAL unref() 模式
 * - 所有定时器注册到统一管理器
 * - 默认 unref() 不阻塞进程退出
 * - gracefulShutdown 时自动清理
 * - 防止同名定时器重复注册
 * - 提供状态查询接口
 */

import { logger } from '../logger.js';

export interface TimerOptions {
  /** 定时器名称（唯一标识，防止重复注册） */
  name: string;
  /** 间隔（毫秒） */
  intervalMs: number;
  /** 回调函数 */
  callback: () => void | Promise<void>;
  /** 是否 unref（默认 true，不阻塞进程退出） */
  unref?: boolean;
  /** 是否在启动时立即执行一次（默认 false） */
  immediate?: boolean;
  /** 是否启用（默认 true，false 时不注册） */
  enabled?: boolean;
}

interface TimerEntry {
  name: string;
  handle: NodeJS.Timeout;
  intervalMs: number;
  registeredAt: number;
  lastFiredAt: number | null;
  unref: boolean;
}

class TimerManagerImpl {
  private timers: Map<string, TimerEntry> = new Map();
  private isShuttingDown = false;

  /**
   * 注册定时器
   */
  register(options: TimerOptions): NodeJS.Timeout | null {
    const { name, intervalMs, callback, unref = true, immediate = false, enabled = true } = options;

    if (!enabled) {
      logger.debug(`[TimerManager] 定时器 ${name} 已禁用，跳过注册`);
      return null;
    }

    if (this.isShuttingDown) {
      logger.warn(`[TimerManager] 正在关闭，拒绝注册定时器: ${name}`);
      return null;
    }

    // 防止重复注册
    if (this.timers.has(name)) {
      logger.warn(`[TimerManager] 定时器 ${name} 已存在，跳过重复注册`);
      return this.timers.get(name)!.handle;
    }

    const wrappedCallback = () => {
      try {
        const result = callback();
        if (result instanceof Promise) {
          result.catch(err => {
            logger.error(`[TimerManager] 定时器 ${name} 执行失败:`, err instanceof Error ? err.message : String(err));
          });
        }
      } catch (err) {
        logger.error(`[TimerManager] 定时器 ${name} 执行失败:`, err instanceof Error ? err.message : String(err));
      }
      const entry = this.timers.get(name);
      if (entry) entry.lastFiredAt = Date.now();
    };

    const handle = setInterval(wrappedCallback, intervalMs);

    if (unref) {
      handle.unref();
    }

    this.timers.set(name, {
      name,
      handle,
      intervalMs,
      registeredAt: Date.now(),
      lastFiredAt: null,
      unref,
    });

    logger.debug(`[TimerManager] 已注册定时器: ${name} (${intervalMs}ms, unref=${unref})`);

    if (immediate) {
      wrappedCallback();
    }

    return handle;
  }

  /**
   * 取消指定定时器
   */
  unregister(name: string): boolean {
    const entry = this.timers.get(name);
    if (!entry) return false;
    clearInterval(entry.handle);
    this.timers.delete(name);
    logger.debug(`[TimerManager] 已取消定时器: ${name}`);
    return true;
  }

  /**
   * 清理所有定时器（gracefulShutdown 用）
   */
  clearAll(): number {
    this.isShuttingDown = true;
    let count = 0;
    for (const [name, entry] of this.timers) {
      clearInterval(entry.handle);
      count++;
      logger.debug(`[TimerManager] 已清理定时器: ${name}`);
    }
    this.timers.clear();
    logger.info(`[TimerManager] 已清理 ${count} 个定时器`);
    return count;
  }

  /**
   * 获取所有定时器状态
   */
  getStatus(): Array<{ name: string; intervalMs: number; registeredAt: string; lastFiredAt: string | null; unref: boolean }> {
    return Array.from(this.timers.values()).map(entry => ({
      name: entry.name,
      intervalMs: entry.intervalMs,
      registeredAt: new Date(entry.registeredAt).toISOString(),
      lastFiredAt: entry.lastFiredAt ? new Date(entry.lastFiredAt).toISOString() : null,
      unref: entry.unref,
    }));
  }

  /** 已注册的定时器数量 */
  get count(): number {
    return this.timers.size;
  }
}

/** 全局单例 */
export const TimerManager = new TimerManagerImpl();

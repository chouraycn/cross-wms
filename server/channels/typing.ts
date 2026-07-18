/**
 * 输入指示器运行时管理。
 *
 * 跟踪用户在某个频道中的输入状态，支持过期检测与刷新。
 */

import type { ChannelId } from "./types.js";

/** 输入指示器默认存活时长（毫秒）。 */
const DEFAULT_TYPING_TTL_MS = 5_000;

/**
 * 表示某个用户在某个频道中的输入状态。
 */
export class TypingIndicator {
  channelId: ChannelId;
  userId: string;
  startedAt: number;
  expiresAt: number;

  private ttlMs: number;

  constructor(channelId: ChannelId, userId: string, ttlMs = DEFAULT_TYPING_TTL_MS) {
    this.channelId = channelId;
    this.userId = userId;
    this.ttlMs = ttlMs;
    const now = Date.now();
    this.startedAt = now;
    this.expiresAt = now + ttlMs;
  }

  /**
   * 检查当前输入指示器是否已过期。
   */
  isExpired(): boolean {
    return Date.now() > this.expiresAt;
  }

  /**
   * 刷新输入指示器的过期时间。
   */
  refresh(): void {
    const now = Date.now();
    this.startedAt = now;
    this.expiresAt = now + this.ttlMs;
  }
}

/**
 * 输入状态变更回调。
 */
export type TypingCallback = {
  onTypingStart?(channelId: ChannelId, userId: string): void;
  onTypingStop?(channelId: ChannelId, userId: string): void;
};

/**
 * 管理多个频道的输入状态。
 *
 * 按 channelId -> userId -> TypingIndicator 组织内存索引。
 */
export class TypingCallbacks {
  private indicators = new Map<ChannelId, Map<string, TypingIndicator>>();
  private callbacks: TypingCallback[] = [];
  private cleanupTimer: ReturnType<typeof setInterval> | undefined;

  constructor(autoCleanupIntervalMs = 10_000) {
    if (autoCleanupIntervalMs > 0) {
      this.cleanupTimer = setInterval(() => this.cleanupExpired(), autoCleanupIntervalMs);
      this.cleanupTimer.unref?.();
    }
  }

  /**
   * 注册输入状态监听回调。
   */
  addCallback(callback: TypingCallback): void {
    this.callbacks.push(callback);
  }

  /**
   * 移除输入状态监听回调。
   */
  removeCallback(callback: TypingCallback): void {
    const idx = this.callbacks.indexOf(callback);
    if (idx >= 0) {
      this.callbacks.splice(idx, 1);
    }
  }

  /**
   * 触发用户开始输入事件。
   */
  onTypingStart(channelId: ChannelId, userId: string): void {
    let channelMap = this.indicators.get(channelId);
    if (!channelMap) {
      channelMap = new Map<string, TypingIndicator>();
      this.indicators.set(channelId, channelMap);
    }

    const existing = channelMap.get(userId);
    if (existing) {
      existing.refresh();
    } else {
      channelMap.set(userId, new TypingIndicator(channelId, userId));
      for (const cb of this.callbacks) {
        cb.onTypingStart?.(channelId, userId);
      }
    }
  }

  /**
   * 触发用户停止输入事件。
   */
  onTypingStop(channelId: ChannelId, userId: string): void {
    const channelMap = this.indicators.get(channelId);
    if (!channelMap) {
      return;
    }

    const had = channelMap.delete(userId);
    if (had) {
      for (const cb of this.callbacks) {
        cb.onTypingStop?.(channelId, userId);
      }
    }

    if (channelMap.size === 0) {
      this.indicators.delete(channelId);
    }
  }

  /**
   * 获取指定频道中当前正在输入的用户列表。
   */
  getActiveTypers(channelId: ChannelId): string[] {
    const channelMap = this.indicators.get(channelId);
    if (!channelMap) {
      return [];
    }

    const result: string[] = [];
    for (const [userId, indicator] of channelMap) {
      if (!indicator.isExpired()) {
        result.push(userId);
      }
    }
    return result;
  }

  /**
   * 清理所有已过期的输入指示器。
   */
  cleanupExpired(): void {
    const now = Date.now();
    for (const [channelId, channelMap] of this.indicators) {
      for (const [userId, indicator] of channelMap) {
        if (indicator.expiresAt <= now) {
          channelMap.delete(userId);
          for (const cb of this.callbacks) {
            cb.onTypingStop?.(channelId, userId);
          }
        }
      }
      if (channelMap.size === 0) {
        this.indicators.delete(channelId);
      }
    }
  }

  /**
   * 销毁资源，停止自动清理定时器。
   */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.indicators.clear();
    this.callbacks = [];
  }
}

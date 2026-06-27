/**
 * Heartbeat — 长连接心跳保活模块
 *
 * 功能特性：
 * - SSE 流式输出无数据时自动发送心跳
 * - 防止连接超时断开
 * - 保持用户感知（"AI 正在思考..." 状态提示）
 * - 可配置心跳间隔和消息内容
 * - 支持多种心跳策略（空行 / 注释 / 状态事件）
 * - 自动统计心跳发送次数
 *
 * 集成思路：
 * 1. 在 streamExecutor / agentRuntime 启动时创建 Heartbeat 实例
 * 2. 每次收到真实数据时调用 reset() 重置心跳计时器
 * 3. 计时器触发时发送心跳事件到客户端
 * 4. 流结束时调用 stop() 清理
 */

import { logger } from '../logger.js';

// ==================== 常量 ====================

/** 默认心跳间隔（毫秒） */
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 10000;

/** 默认最大心跳次数（避免无限制发送） */
export const DEFAULT_MAX_HEARTBEATS = 60;

// ==================== 类型定义 ====================

export type HeartbeatStrategy = 'empty_line' | 'comment' | 'event' | 'sse_comment';

export interface HeartbeatConfig {
  intervalMs: number;
  maxHeartbeats: number;
  strategy: HeartbeatStrategy;
  eventName: string;
  defaultMessage: string;
  autoStart: boolean;
}

export interface HeartbeatStats {
  sent: number;
  lastSentAt?: number;
  maxReached: boolean;
}

export type HeartbeatSender = (payload: string | { event: string; data: string }) => void;

// ==================== 默认配置 ====================

const DEFAULT_CONFIG: HeartbeatConfig = {
  intervalMs: DEFAULT_HEARTBEAT_INTERVAL_MS,
  maxHeartbeats: DEFAULT_MAX_HEARTBEATS,
  strategy: 'event',
  eventName: 'heartbeat',
  defaultMessage: 'AI 正在思考中，请稍候…',
  autoStart: false,
};

// ==================== Heartbeat 类 ====================

export class Heartbeat {
  private config: HeartbeatConfig;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sender: HeartbeatSender | null = null;
  private sent: number = 0;
  private lastSentAt: number | null = null;
  private maxReached: boolean = false;
  private running: boolean = false;
  private customMessage: string | null = null;
  private onMaxReachedCallback: (() => void) | null = null;

  constructor(config?: Partial<HeartbeatConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setConfig(config: Partial<HeartbeatConfig>): void {
    this.config = { ...this.config, ...config };
  }

  setSender(sender: HeartbeatSender): void {
    this.sender = sender;
  }

  setMessage(message: string): void {
    this.customMessage = message;
  }

  onMaxReached(callback: () => void): void {
    this.onMaxReachedCallback = callback;
  }

  start(sender?: HeartbeatSender): void {
    if (this.running) return;

    if (sender) {
      this.sender = sender;
    }

    if (!this.sender) {
      logger.warn('[Heartbeat] 启动失败: 未设置 sender');
      return;
    }

    this.running = true;
    this.sent = 0;
    this.maxReached = false;
    this.scheduleNext();

    logger.debug('[Heartbeat] 已启动');
  }

  stop(): void {
    this.clearTimer();
    this.running = false;
    logger.debug(`[Heartbeat] 已停止，共发送 ${this.sent} 次心跳`);
  }

  reset(): void {
    if (!this.running) return;
    this.clearTimer();
    this.scheduleNext();
  }

  private scheduleNext(): void {
    if (!this.running || this.maxReached) return;

    this.clearTimer();
    this.timer = setTimeout(() => {
      this.tick();
    }, this.config.intervalMs);
  }

  private tick(): void {
    if (!this.running || !this.sender) return;

    if (this.sent >= this.config.maxHeartbeats) {
      if (!this.maxReached) {
        this.maxReached = true;
        logger.warn(`[Heartbeat] 达到最大心跳次数 (${this.config.maxHeartbeats})`);
        this.onMaxReachedCallback?.();
      }
      return;
    }

    try {
      const message = this.customMessage || this.config.defaultMessage;

      switch (this.config.strategy) {
        case 'empty_line':
          this.sender('\n');
          break;

        case 'comment':
          this.sender(`: ${message}\n\n`);
          break;

        case 'sse_comment':
          this.sender(`: ${message}\n\n`);
          break;

        case 'event':
        default:
          this.sender({
            event: this.config.eventName,
            data: JSON.stringify({
              message,
              timestamp: Date.now(),
              count: this.sent + 1,
            }),
          });
          break;
      }

      this.sent++;
      this.lastSentAt = Date.now();

      logger.debug(`[Heartbeat] 发送心跳 #${this.sent}`);
    } catch (e) {
      logger.warn('[Heartbeat] 发送心跳失败:', e);
    }

    this.scheduleNext();
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  getStats(): HeartbeatStats {
    return {
      sent: this.sent,
      lastSentAt: this.lastSentAt ?? undefined,
      maxReached: this.maxReached,
    };
  }

  getInterval(): number {
    return this.config.intervalMs;
  }

  getElapsedSinceLastData(): number {
    if (!this.lastSentAt) return 0;
    return Date.now() - this.lastSentAt;
  }
}

// ==================== 便捷函数 ====================

/**
 * 创建并启动一个心跳实例
 */
export function createHeartbeat(
  sender: HeartbeatSender,
  config?: Partial<HeartbeatConfig>
): Heartbeat {
  const hb = new Heartbeat(config);
  hb.setSender(sender);
  if (config?.autoStart) {
    hb.start();
  }
  return hb;
}

/**
 * 包装一个异步函数，自动管理心跳
 */
export async function withHeartbeat<T>(
  fn: (heartbeat: Heartbeat) => Promise<T>,
  sender: HeartbeatSender,
  config?: Partial<HeartbeatConfig>
): Promise<T> {
  const heartbeat = new Heartbeat(config);
  heartbeat.setSender(sender);
  heartbeat.start();

  try {
    const result = await fn(heartbeat);
    return result;
  } finally {
    heartbeat.stop();
  }
}

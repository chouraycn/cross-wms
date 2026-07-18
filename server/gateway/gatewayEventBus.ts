/**
 * Gateway Event Bus
 * Gateway 事件总线模块
 *
 * 基于 Node.js 内置 EventEmitter 的轻量封装：
 * - 提供强类型 GatewayEvent 对象
 * - 异步订阅、过滤器订阅
 * - 历史快照（环形缓冲）便于回放调试
 * - 并发安全：在 emit 期间复制监听器列表
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { logger } from '../logger.js';
import { GATEWAY_EVENT_SOURCES, type GatewayEventSource, type GatewayEventType } from './gatewayEventTypes.js';

// ==================== 类型定义 ====================

export interface GatewayEvent<P = unknown> {
  /** 事件唯一 ID */
  id: string;
  /** 事件类型 */
  type: GatewayEventType | string;
  /** 事件来源模块 */
  source: GatewayEventSource | string;
  /** 可选会话标识 */
  sessionKey?: string;
  /** 事件载荷（任意业务数据） */
  payload: P;
  /** 事件产生时间戳（毫秒） */
  timestamp: number;
  /** 链路追踪 ID（用于跨模块追踪） */
  traceId?: string;
}

export type GatewayEventHandler<P = unknown> = (event: GatewayEvent<P>) => void;
export type GatewayAsyncHandler<P = unknown> = (event: GatewayEvent<P>) => Promise<void>;
export type GatewayEventFilter<P = unknown> = (event: GatewayEvent<P>) => boolean;

export interface GatewayEventBusOptions {
  /** 历史快照默认容量（环形缓冲） */
  historySize?: number;
  /** 单事件监听器上限（防止内存泄漏） */
  maxListeners?: number;
}

const DEFAULT_HISTORY_SIZE = 200;
const DEFAULT_MAX_LISTENERS = 100;

// ==================== GatewayEventBus 类 ====================

export class GatewayEventBus {
  private readonly emitter: EventEmitter;
  private readonly history: GatewayEvent[];
  private readonly historyCapacity: number;

  constructor(options: GatewayEventBusOptions = {}) {
    this.historyCapacity = Math.max(1, options.historySize ?? DEFAULT_HISTORY_SIZE);
    this.history = [];
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(options.maxListeners ?? DEFAULT_MAX_LISTENERS);
  }

  /**
   * 派发一个事件
   * 返回 EventEmitter.emit 的结果（true 表示存在监听器）
   */
  emit(event: GatewayEvent): boolean {
    if (!event || typeof event !== 'object') {
      throw new TypeError('GatewayEventBus.emit: event 必须是对象');
    }
    if (!event.id) {
      event.id = randomUUID();
    }
    if (!event.timestamp) {
      event.timestamp = Date.now();
    }

    // 写入历史快照（环形缓冲）
    this.pushHistory(event);

    // 复制监听器列表后再触发，避免在迭代中增删监听器导致问题
    const listenerCount = this.emitter.listenerCount(event.type);
    if (listenerCount === 0) {
      return false;
    }

    try {
      return this.emitter.emit(event.type, event);
    } catch (err) {
      logger.error(`[GatewayEventBus] emit(${event.type}) 监听器抛出错误:`, err);
      throw err;
    }
  }

  /**
   * 便捷构造并派发事件
   */
  emitEvent<P>(
    type: GatewayEventType | string,
    source: GatewayEventSource | string,
    payload: P,
    extras: { sessionKey?: string; traceId?: string; id?: string; timestamp?: number } = {},
  ): boolean {
    return this.emit({
      id: extras.id ?? randomUUID(),
      type,
      source,
      sessionKey: extras.sessionKey,
      payload,
      timestamp: extras.timestamp ?? Date.now(),
      traceId: extras.traceId,
    });
  }

  /**
   * 注册监听器
   * 返回取消订阅函数
   */
  on(eventType: GatewayEventType | string, handler: GatewayEventHandler): () => void {
    this.emitter.on(eventType, handler as (...args: unknown[]) => void);
    return () => this.off(eventType, handler);
  }

  /**
   * 移除监听器
   */
  off(eventType: GatewayEventType | string, handler: GatewayEventHandler): void {
    this.emitter.off(eventType, handler as (...args: unknown[]) => void);
  }

  /**
   * 一次性订阅
   */
  once(eventType: GatewayEventType | string, handler: GatewayEventHandler): () => void {
    const wrapped = ((event: GatewayEvent) => {
      this.emitter.off(eventType, wrapped as (...args: unknown[]) => void);
      handler(event);
    }) as GatewayEventHandler;
    this.emitter.on(eventType, wrapped as (...args: unknown[]) => void);
    return () => this.emitter.off(eventType, wrapped as (...args: unknown[]) => void);
  }

  /**
   * 获取指定事件类型的监听器数量
   */
  listenerCount(eventType: GatewayEventType | string): number {
    return this.emitter.listenerCount(eventType);
  }

  /**
   * 移除指定事件类型（或全部）的监听器
   */
  removeAllListeners(eventType?: GatewayEventType | string): void {
    if (typeof eventType === 'string') {
      this.emitter.removeAllListeners(eventType);
    } else {
      this.emitter.removeAllListeners();
    }
  }

  /**
   * 异步订阅
   * - 自动捕获 reject 并记录到日志
   * - 返回取消订阅函数
   */
  subscribeAsync<P = unknown>(
    eventType: GatewayEventType | string,
    asyncHandler: GatewayAsyncHandler<P>,
  ): () => void {
    const safeHandler: GatewayEventHandler = (event) => {
      Promise.resolve()
        .then(() => asyncHandler(event as GatewayEvent<P>))
        .catch((err) => {
          logger.error(
            `[GatewayEventBus] subscribeAsync(${eventType}) 抛出错误:`,
            err,
          );
        });
    };
    return this.on(eventType, safeHandler);
  }

  /**
   * 过滤器订阅
   * - 仅当 filter(event) === true 时调用 handler
   * - 返回取消订阅函数
   */
  subscribeWithFilter<P = unknown>(
    eventType: GatewayEventType | string,
    filter: GatewayEventFilter<P>,
    handler: GatewayEventHandler<P>,
  ): () => void {
    const wrapped: GatewayEventHandler = (event) => {
      try {
        if (filter(event as GatewayEvent<P>)) {
          handler(event as GatewayEvent<P>);
        }
      } catch (err) {
        logger.error(
          `[GatewayEventBus] subscribeWithFilter(${eventType}) filter 抛出错误:`,
          err,
        );
      }
    };
    return this.on(eventType, wrapped);
  }

  /**
   * 调整历史快照容量
   * - 正数：截断至新容量
   * - <= 0：清空历史
   */
  recordHistory(size?: number): void {
    if (typeof size === 'number') {
      if (size <= 0) {
        this.history.length = 0;
        return;
      }
      // 更新容量（不影响已存数据，超出部分将在下次 push 时被裁剪）
      (this as unknown as { historyCapacity: number }).historyCapacity = size;
      while (this.history.length > size) {
        this.history.shift();
      }
    }
  }

  /**
   * 获取历史快照（拷贝）
   */
  getHistory(): GatewayEvent[] {
    return this.history.slice();
  }

  /**
   * 获取最近 N 条历史
   */
  getRecentHistory(limit: number): GatewayEvent[] {
    if (limit <= 0) return [];
    return this.history.slice(-limit);
  }

  /**
   * 清空历史快照
   */
  clearHistory(): void {
    this.history.length = 0;
  }

  /**
   * 获取当前历史容量
   */
  getHistoryCapacity(): number {
    return this.historyCapacity;
  }

  private pushHistory(event: GatewayEvent): void {
    this.history.push(event);
    while (this.history.length > this.historyCapacity) {
      this.history.shift();
    }
  }
}

// ==================== 单例导出 ====================

const GATEWAY_EVENT_BUS_INSTANCE = new GatewayEventBus();

export function getGatewayEventBus(): GatewayEventBus {
  return GATEWAY_EVENT_BUS_INSTANCE;
}

export const gatewayEventBus: GatewayEventBus = GATEWAY_EVENT_BUS_INSTANCE;

// 避免未使用导入告警
export { GATEWAY_EVENT_SOURCES };

/**
 * Plugin SDK 事件总线 — 进程内 pub/sub
 *
 * 与现有 ./types.ts 中 PluginEventBus 接口的关系：
 * - ./types.ts 定义接口契约
 * - 本文件提供默认实现（同步分发 + 命名空间隔离 + 通配符订阅）
 *
 * 设计要点：
 * - 同步分发（emit 立即触发所有 handler），避免事件风暴时队列堆积
 * - 按插件 ID 命名空间隔离，避免跨插件事件污染
 * - 支持 wildcard 订阅（`plugin:*` 匹配所有 plugin: 前缀事件）
 * - handler 抛错不影响其他 handler（catch 后记录到 logger）
 */

import { logger } from '../../logger.js';
import {
  EVENT_PLUGIN_ERROR,
} from './plugin-constants.js';

/** 事件处理器签名 */
export type PluginEventHandler = (payload: unknown) => void;

/** 事件订阅句柄（取消订阅） */
export interface PluginEventSubscription {
  /** 取消订阅 */
  unsubscribe(): void;
  /** 事件名 */
  readonly event: string;
}

/** 命名空间隔离的事件总线 */
export class PluginEventBusImpl {
  private handlers = new Map<string, Set<PluginEventHandler>>();
  private pluginId?: string;

  constructor(options: { pluginId?: string } = {}) {
    if (options.pluginId !== undefined) {
      this.pluginId = options.pluginId;
    }
  }

  /** 触发事件 */
  emit(event: string, payload?: unknown): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(payload);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const prefix = this.pluginId ? `[Plugin:${this.pluginId}]` : '[PluginEvents]';
          logger.warn(`${prefix} 事件 handler 抛错: event=${event} error=${msg}`);
        }
      }
    }
    // 通配符匹配：`plugin:*` 匹配 `plugin:loaded` 等
    for (const [pattern, wildcardHandlers] of this.handlers) {
      if (pattern.endsWith('*') && event.startsWith(pattern.slice(0, -1))) {
        for (const handler of wildcardHandlers) {
          try {
            handler(payload);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.warn(`[PluginEvents] 通配符 handler 抛错: pattern=${pattern} event=${event} error=${msg}`);
          }
        }
      }
    }
  }

  /** 订阅事件 */
  on(event: string, handler: PluginEventHandler): PluginEventSubscription {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
    return {
      event,
      unsubscribe: () => this.off(event, handler),
    };
  }

  /** 只订阅一次 */
  once(event: string, handler: PluginEventHandler): PluginEventSubscription {
    const wrapper: PluginEventHandler = (payload) => {
      this.off(event, wrapper);
      handler(payload);
    };
    return this.on(event, wrapper);
  }

  /** 取消订阅 */
  off(event: string, handler: PluginEventHandler): void {
    const set = this.handlers.get(event);
    if (set) {
      set.delete(handler);
      if (set.size === 0) {
        this.handlers.delete(event);
      }
    }
  }

  /** 移除某事件的所有 handler */
  clear(event?: string): void {
    if (event) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
  }

  /** 列出已注册的事件名 */
  listEvents(): string[] {
    return Array.from(this.handlers.keys());
  }

  /** 获取某事件的 handler 数量 */
  handlerCount(event: string): number {
    return this.handlers.get(event)?.size ?? 0;
  }
}

// ===================== 全局事件总线 =====================

/** 全局共享事件总线（跨插件通信） */
const globalEventBus = new PluginEventBusImpl();

/** 获取全局事件总线 */
export function getGlobalEventBus(): PluginEventBusImpl {
  return globalEventBus;
}

/** 创建插件命名空间事件总线 */
export function createPluginEventBus(pluginId: string): PluginEventBusImpl {
  return new PluginEventBusImpl({ pluginId });
}

/** 触发全局错误事件 */
export function emitPluginError(pluginId: string, error: unknown): void {
  const payload = {
    pluginId,
    message: error instanceof Error ? error.message : String(error),
    timestamp: Date.now(),
    stack: error instanceof Error ? error.stack : undefined,
  };
  globalEventBus.emit(EVENT_PLUGIN_ERROR, payload);
}

// ===================== 类型适配器 =====================

/**
 * 将 PluginEventBusImpl 适配为 ./types.ts 中定义的 PluginEventBus 接口。
 *
 * 用于注入到 PluginContext 时保持接口兼容。
 */
export function adaptToPluginEventBus(bus: PluginEventBusImpl) {
  return {
    emit: (event: string, payload?: unknown) => bus.emit(event, payload),
    on: (event: string, handler: (payload: unknown) => void) => {
      const sub = bus.on(event, handler as PluginEventHandler);
      return () => sub.unsubscribe();
    },
    off: (event: string, handler: (payload: unknown) => void) => {
      bus.off(event, handler as PluginEventHandler);
    },
  };
}

import { EventEmitter } from 'node:events';

/**
 * 诊断事件级别
 */
export type DiagnosticEventLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * 链路诊断事件结构，用于在 EventBus 中流转
 */
export type DiagnosticEvent = {
  eventType: string;
  timestamp: number;
  level: DiagnosticEventLevel;
  message: string;
  traceId?: string;
  spanId?: string;
  metadata?: Record<string, unknown>;
};

/**
 * 诊断事件处理器类型
 */
export type DiagnosticEventHandler = (event: DiagnosticEvent) => void;

/**
 * 基于 EventEmitter 的诊断事件总线，支持按事件类型订阅与通配符订阅
 */
export class DiagnosticEventBus {
  private emitter = new EventEmitter();
  private wildcardHandlers: Set<DiagnosticEventHandler> = new Set();

  /**
   * 发送一个诊断事件
   */
  emit(event: DiagnosticEvent): void {
    // 先按具体 eventType 分发
    this.emitter.emit(event.eventType, event);
    // 再向通配符订阅者广播
    for (const handler of this.wildcardHandlers) {
      try {
        handler(event);
      } catch {
        // 诊断事件不应因消费者异常而中断
      }
    }
  }

  /**
   * 订阅指定类型的事件；返回取消订阅函数
   * 传入 '*' 可监听所有事件
   */
  on(eventType: string, handler: DiagnosticEventHandler): () => void {
    if (eventType === '*') {
      this.wildcardHandlers.add(handler);
      return () => {
        this.wildcardHandlers.delete(handler);
      };
    }

    this.emitter.on(eventType, handler);
    return () => {
      this.off(eventType, handler);
    };
  }

  /**
   * 移除指定类型的事件处理器
   */
  off(eventType: string, handler: DiagnosticEventHandler): void {
    if (eventType === '*') {
      this.wildcardHandlers.delete(handler);
      return;
    }
    this.emitter.off(eventType, handler);
  }

  /**
   * 移除指定类型的所有处理器（测试/清理用）
   */
  removeAllListeners(eventType?: string): void {
    if (eventType === '*') {
      this.wildcardHandlers.clear();
      return;
    }
    if (eventType) {
      this.emitter.removeAllListeners(eventType);
    } else {
      this.emitter.removeAllListeners();
      this.wildcardHandlers.clear();
    }
  }
}

/**
 * 全局默认事件总线实例
 */
export const defaultDiagnosticEventBus = new DiagnosticEventBus();

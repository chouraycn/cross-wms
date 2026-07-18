import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  GatewayEventBus,
  gatewayEventBus,
} from '../gatewayEventBus.js';
import {
  GATEWAY_EVENT_TYPES,
  GATEWAY_EVENT_SOURCES,
} from '../gatewayEventTypes.js';
import type { GatewayEvent } from '../gatewayEventBus.js';
import { logger } from '../../logger.js';

function buildEvent(overrides: Partial<GatewayEvent> = {}): GatewayEvent {
  return {
    id: overrides.id ?? 'evt-' + Math.random().toString(36).slice(2, 10),
    type: overrides.type ?? GATEWAY_EVENT_TYPES.CHAT_MESSAGE,
    source: overrides.source ?? GATEWAY_EVENT_SOURCES.CHAT,
    sessionKey: overrides.sessionKey ?? 'session-1',
    payload: overrides.payload ?? { content: 'hello' },
    timestamp: overrides.timestamp ?? Date.now(),
    traceId: overrides.traceId,
  };
}

describe('GatewayEventBus 模块单元测试', () => {
  let bus: GatewayEventBus;

  beforeEach(() => {
    bus = new GatewayEventBus({ historySize: 5 });
  });

  // ==================== 基础 emit / on / off ====================

  it('应该通过 emit/on 触发监听器', () => {
    const handler = vi.fn();
    bus.on(GATEWAY_EVENT_TYPES.CHAT_MESSAGE, handler);

    const evt = buildEvent();
    const result = bus.emit(evt);

    expect(result).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(evt);
  });

  it('没有监听器时 emit 应返回 false', () => {
    const result = bus.emit(buildEvent());
    expect(result).toBe(false);
  });

  it('应该能够通过 off 移除监听器', () => {
    const handler = vi.fn();
    bus.on(GATEWAY_EVENT_TYPES.CHAT_MESSAGE, handler);
    bus.off(GATEWAY_EVENT_TYPES.CHAT_MESSAGE, handler);

    bus.emit(buildEvent());

    expect(handler).not.toHaveBeenCalled();
  });

  it('on 返回的函数应能取消订阅', () => {
    const handler = vi.fn();
    const unsubscribe = bus.on(GATEWAY_EVENT_TYPES.CHAT_MESSAGE, handler);
    unsubscribe();

    bus.emit(buildEvent());

    expect(handler).not.toHaveBeenCalled();
  });

  it('emit 应自动填充 id 与 timestamp', () => {
    let received: GatewayEvent | undefined;
    bus.on(GATEWAY_EVENT_TYPES.CHAT_MESSAGE, (e) => {
      received = e;
    });

    const evt: GatewayEvent = {
      id: '',
      type: GATEWAY_EVENT_TYPES.CHAT_MESSAGE,
      source: GATEWAY_EVENT_SOURCES.CHAT,
      payload: { foo: 'bar' },
      timestamp: 0,
    };
    bus.emit(evt);

    expect(received).toBeDefined();
    expect(received!.id).not.toBe('');
    expect(received!.timestamp).toBeGreaterThan(0);
  });

  // ==================== once ====================

  it('once 监听器只应触发一次', () => {
    const handler = vi.fn();
    bus.once(GATEWAY_EVENT_TYPES.CHAT_MESSAGE, handler);

    bus.emit(buildEvent());
    bus.emit(buildEvent());
    bus.emit(buildEvent());

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('once 返回的函数应能提前取消订阅', () => {
    const handler = vi.fn();
    const cancel = bus.once(GATEWAY_EVENT_TYPES.CHAT_MESSAGE, handler);
    cancel();

    bus.emit(buildEvent());

    expect(handler).not.toHaveBeenCalled();
  });

  // ==================== listenerCount ====================

  it('listenerCount 应正确反映监听器数量', () => {
    expect(bus.listenerCount(GATEWAY_EVENT_TYPES.CHAT_MESSAGE)).toBe(0);

    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on(GATEWAY_EVENT_TYPES.CHAT_MESSAGE, h1);
    bus.on(GATEWAY_EVENT_TYPES.CHAT_MESSAGE, h2);

    expect(bus.listenerCount(GATEWAY_EVENT_TYPES.CHAT_MESSAGE)).toBe(2);
  });

  it('off 后 listenerCount 应减少', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on(GATEWAY_EVENT_TYPES.CHAT_MESSAGE, h1);
    bus.on(GATEWAY_EVENT_TYPES.CHAT_MESSAGE, h2);

    bus.off(GATEWAY_EVENT_TYPES.CHAT_MESSAGE, h1);

    expect(bus.listenerCount(GATEWAY_EVENT_TYPES.CHAT_MESSAGE)).toBe(1);
  });

  // ==================== removeAllListeners ====================

  it('removeAllListeners(指定类型) 应只清空该类型', () => {
    const a = vi.fn();
    const b = vi.fn();
    bus.on(GATEWAY_EVENT_TYPES.CHAT_MESSAGE, a);
    bus.on(GATEWAY_EVENT_TYPES.SESSION_CREATE, b);

    bus.removeAllListeners(GATEWAY_EVENT_TYPES.CHAT_MESSAGE);

    expect(bus.listenerCount(GATEWAY_EVENT_TYPES.CHAT_MESSAGE)).toBe(0);
    expect(bus.listenerCount(GATEWAY_EVENT_TYPES.SESSION_CREATE)).toBe(1);
  });

  it('removeAllListeners() 无参时应清空全部', () => {
    bus.on(GATEWAY_EVENT_TYPES.CHAT_MESSAGE, vi.fn());
    bus.on(GATEWAY_EVENT_TYPES.SESSION_CREATE, vi.fn());

    bus.removeAllListeners();

    expect(bus.listenerCount(GATEWAY_EVENT_TYPES.CHAT_MESSAGE)).toBe(0);
    expect(bus.listenerCount(GATEWAY_EVENT_TYPES.SESSION_CREATE)).toBe(0);
  });

  // ==================== subscribeAsync ====================

  it('subscribeAsync 应能处理异步监听器', async () => {
    const handler = vi.fn(async () => {
      await Promise.resolve();
    });
    bus.subscribeAsync(GATEWAY_EVENT_TYPES.CHAT_MESSAGE, handler);

    bus.emit(buildEvent());
    // 等待微任务队列
    await new Promise((r) => setTimeout(r, 0));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('subscribeAsync 抛错时不应影响其他监听器', async () => {
    const loggerSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const errorHandler = vi.fn(async () => {
      throw new Error('async boom');
    });
    const normalHandler = vi.fn();

    bus.subscribeAsync(GATEWAY_EVENT_TYPES.CHAT_MESSAGE, errorHandler);
    bus.on(GATEWAY_EVENT_TYPES.CHAT_MESSAGE, normalHandler);

    bus.emit(buildEvent());
    await new Promise((r) => setTimeout(r, 0));

    expect(normalHandler).toHaveBeenCalledTimes(1);
    expect(errorHandler).toHaveBeenCalledTimes(1);
    expect(loggerSpy).toHaveBeenCalled();

    loggerSpy.mockRestore();
  });

  // ==================== subscribeWithFilter ====================

  it('subscribeWithFilter 在 filter 返回 true 时应触发 handler', () => {
    const handler = vi.fn();
    bus.subscribeWithFilter(
      GATEWAY_EVENT_TYPES.CHAT_MESSAGE,
      (e) => e.sessionKey === 'session-1',
      handler,
    );

    bus.emit(buildEvent({ sessionKey: 'session-1' }));
    bus.emit(buildEvent({ sessionKey: 'session-2' }));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('subscribeWithFilter 在 filter 返回 false 时不应触发 handler', () => {
    const handler = vi.fn();
    bus.subscribeWithFilter(
      GATEWAY_EVENT_TYPES.CHAT_MESSAGE,
      () => false,
      handler,
    );

    bus.emit(buildEvent());

    expect(handler).not.toHaveBeenCalled();
  });

  it('subscribeWithFilter 的 filter 抛错时不应影响其他事件', () => {
    const loggerSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const filterError = vi.fn(() => {
      throw new Error('filter boom');
    });
    const normalHandler = vi.fn();

    bus.subscribeWithFilter(
      GATEWAY_EVENT_TYPES.CHAT_MESSAGE,
      filterError as unknown as () => boolean,
      normalHandler as unknown as () => void,
    );

    bus.emit(buildEvent());

    expect(filterError).toHaveBeenCalled();
    // 抛错后 handler 不会被调用，但 emit 不会传播异常
    expect(normalHandler).not.toHaveBeenCalled();
    expect(loggerSpy).toHaveBeenCalled();

    loggerSpy.mockRestore();
  });

  // ==================== recordHistory / history ====================

  it('emit 后应自动写入历史快照', () => {
    const evt = buildEvent();
    bus.emit(evt);

    const history = bus.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0]).toEqual(evt);
  });

  it('recordHistory 应限制历史大小（环形缓冲）', () => {
    // capacity 5
    for (let i = 0; i < 8; i++) {
      bus.emit(buildEvent({ id: `evt-${i}` }));
    }

    const history = bus.getHistory();
    expect(history).toHaveLength(5);
    // 保留最近 5 条：evt-3 ~ evt-7
    expect(history[0].id).toBe('evt-3');
    expect(history[4].id).toBe('evt-7');
  });

  it('recordHistory(0) 应清空历史', () => {
    bus.emit(buildEvent());
    bus.emit(buildEvent());
    expect(bus.getHistory()).toHaveLength(2);

    bus.recordHistory(0);
    expect(bus.getHistory()).toHaveLength(0);
  });

  it('recordHistory(新容量) 应截断已有历史', () => {
    for (let i = 0; i < 5; i++) {
      bus.emit(buildEvent({ id: `evt-${i}` }));
    }
    bus.recordHistory(2);

    const history = bus.getHistory();
    expect(history).toHaveLength(2);
    expect(history[0].id).toBe('evt-3');
    expect(history[1].id).toBe('evt-4');
  });

  // ==================== 多种事件类型隔离 ====================

  it('不同事件类型应互不影响', () => {
    const chatHandler = vi.fn();
    const sessionHandler = vi.fn();
    const cronHandler = vi.fn();

    bus.on(GATEWAY_EVENT_TYPES.CHAT_MESSAGE, chatHandler);
    bus.on(GATEWAY_EVENT_TYPES.SESSION_CREATE, sessionHandler);
    bus.on(GATEWAY_EVENT_TYPES.CRON_TICK, cronHandler);

    bus.emit(buildEvent({ type: GATEWAY_EVENT_TYPES.SESSION_CREATE }));
    bus.emit(buildEvent({ type: GATEWAY_EVENT_TYPES.CRON_TICK }));

    expect(chatHandler).not.toHaveBeenCalled();
    expect(sessionHandler).toHaveBeenCalledTimes(1);
    expect(cronHandler).toHaveBeenCalledTimes(1);
  });

  // ==================== 并发 emit 安全性 ====================

  it('并发 emit 不应抛出错误且每个事件都应被记录', () => {
    const handler = vi.fn();
    bus.on(GATEWAY_EVENT_TYPES.CHAT_MESSAGE, handler);

    // 同时 emit 100 次
    const N = 100;
    for (let i = 0; i < N; i++) {
      bus.emit(buildEvent({ id: `evt-${i}` }));
    }

    expect(handler).toHaveBeenCalledTimes(N);
    // 历史容量 5，应只剩最近 5 条
    const history = bus.getHistory();
    expect(history).toHaveLength(5);
    expect(history[0].id).toBe(`evt-${N - 5}`);
    expect(history[4].id).toBe(`evt-${N - 1}`);
  });

  it('emit 期间注册新监听器应不影响当前事件', () => {
    const newHandler = vi.fn();
    let registered = false;
    const firstHandler = vi.fn(() => {
      // 仅在第一次触发时注册新监听器，避免覆盖引用
      if (!registered) {
        registered = true;
        bus.on(GATEWAY_EVENT_TYPES.CHAT_MESSAGE, newHandler);
      }
    });

    bus.on(GATEWAY_EVENT_TYPES.CHAT_MESSAGE, firstHandler);

    bus.emit(buildEvent());
    // 第二个事件，新监听器才会被触发
    bus.emit(buildEvent());

    expect(firstHandler).toHaveBeenCalledTimes(2);
    expect(newHandler).toHaveBeenCalledTimes(1);
  });

  // ==================== 单例 & 错误参数 ====================

  it('默认导出的 gatewayEventBus 应为单例', () => {
    expect(gatewayEventBus).toBeInstanceOf(GatewayEventBus);
    // 监听能力可用
    const handler = vi.fn();
    const off = gatewayEventBus.on(GATEWAY_EVENT_TYPES.SYSTEM_READY, handler);
    gatewayEventBus.emitEvent(
      GATEWAY_EVENT_TYPES.SYSTEM_READY,
      GATEWAY_EVENT_SOURCES.SYSTEM,
      { version: '1.0.0', startedAt: Date.now() },
    );
    expect(handler).toHaveBeenCalledTimes(1);
    off();
  });

  it('emit 传入非对象时应抛出 TypeError', () => {
    expect(() => bus.emit(null as unknown as GatewayEvent)).toThrow(TypeError);
    expect(() => bus.emit(undefined as unknown as GatewayEvent)).toThrow(TypeError);
  });
});

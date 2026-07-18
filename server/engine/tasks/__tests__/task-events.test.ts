import { describe, it, expect, vi } from 'vitest';
import { TaskEventBus } from '../task-events.js';
import type { TaskEvent } from '../types.js';

describe('task-events', () => {
  it('on/off 订阅与取消', () => {
    const bus = new TaskEventBus();
    const cb = vi.fn();
    const off = bus.on('task:completed', cb);
    bus.emit('task:completed', 't1');
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    bus.emit('task:completed', 't2');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('once 仅触发一次', () => {
    const bus = new TaskEventBus();
    const cb = vi.fn();
    bus.once('task:started', cb);
    bus.emit('task:started', 'a');
    bus.emit('task:started', 'b');
    expect(cb).toHaveBeenCalledTimes(1);
    expect(bus.size()).toBe(0);
  });

  it('通配 * 监听全部事件', () => {
    const bus = new TaskEventBus();
    const cb = vi.fn();
    bus.on('*', cb);
    bus.emit('task:created', 't1');
    bus.emit('task:failed', 't1');
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('filter 过滤事件', () => {
    const bus = new TaskEventBus();
    const cb = vi.fn();
    bus.on('task:progress', cb, (e) => (e.data as { percent: number }).percent >= 50);
    bus.emit('task:progress', 't1', { percent: 20 });
    bus.emit('task:progress', 't1', { percent: 80 });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('监听器抛错不影响其他订阅者', () => {
    const bus = new TaskEventBus();
    const ok = vi.fn();
    bus.on('task:failed', () => { throw new Error('boom'); });
    bus.on('task:failed', ok);
    bus.emit('task:failed', 't1');
    expect(ok).toHaveBeenCalled();
  });

  it('emit 返回实际派发数', () => {
    const bus = new TaskEventBus();
    bus.on('task:queued', () => {});
    bus.on('task:queued', () => {});
    expect(bus.emit('task:queued', 't1')).toBe(2);
  });

  it('emit 直接接收 TaskEvent 对象', () => {
    const bus = new TaskEventBus();
    const cb = vi.fn();
    bus.on('task:cancelled', cb);
    const event: TaskEvent = { type: 'task:cancelled', taskId: 'x', timestamp: new Date().toISOString() };
    bus.emit(event);
    expect(cb).toHaveBeenCalledWith(event);
  });
});

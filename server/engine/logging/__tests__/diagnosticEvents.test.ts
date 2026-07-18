import { describe, it, expect, vi } from 'vitest';
import { DiagnosticEventBus } from '../diagnosticEvents.js';
import type { DiagnosticEvent } from '../diagnosticEvents.js';

describe('logging > diagnosticEvents', () => {
  it('emits and receives typed events', () => {
    const bus = new DiagnosticEventBus();
    const handler = vi.fn();
    const unsubscribe = bus.on('test.event', handler);

    const event: DiagnosticEvent = {
      eventType: 'test.event',
      timestamp: Date.now(),
      level: 'info',
      message: 'hello',
    };
    bus.emit(event);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ message: 'hello' }));

    unsubscribe();
    bus.emit(event);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('supports wildcard subscription', () => {
    const bus = new DiagnosticEventBus();
    const handler = vi.fn();
    const unsubscribe = bus.on('*', handler);

    bus.emit({ eventType: 'a', timestamp: 1, level: 'info', message: 'm1' });
    bus.emit({ eventType: 'b', timestamp: 2, level: 'warn', message: 'm2' });

    expect(handler).toHaveBeenCalledTimes(2);

    unsubscribe();
    bus.emit({ eventType: 'c', timestamp: 3, level: 'error', message: 'm3' });
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('supports off to remove wildcard handler', () => {
    const bus = new DiagnosticEventBus();
    const handler = vi.fn();
    bus.on('*', handler);
    bus.off('*', handler);
    bus.emit({ eventType: 'x', timestamp: 1, level: 'info', message: 'm' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('supports off to remove typed handler', () => {
    const bus = new DiagnosticEventBus();
    const handler = vi.fn();
    bus.on('typed', handler);
    bus.off('typed', handler);
    bus.emit({ eventType: 'typed', timestamp: 1, level: 'info', message: 'm' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not break when emitting without listeners', () => {
    const bus = new DiagnosticEventBus();
    expect(() => {
      bus.emit({ eventType: 'noop', timestamp: 1, level: 'info', message: 'noop' });
    }).not.toThrow();
  });

  it('isolates handlers between bus instances', () => {
    const busA = new DiagnosticEventBus();
    const busB = new DiagnosticEventBus();
    const handlerA = vi.fn();
    busA.on('shared', handlerA);

    busB.emit({ eventType: 'shared', timestamp: 1, level: 'info', message: 'from-b' });
    expect(handlerA).not.toHaveBeenCalled();
  });

  it('carries traceId and spanId when provided', () => {
    const bus = new DiagnosticEventBus();
    const handler = vi.fn();
    bus.on('trace', handler);

    bus.emit({
      eventType: 'trace',
      timestamp: 1,
      level: 'debug',
      message: 'traced',
      traceId: 't1',
      spanId: 's1',
      metadata: { key: 'value' },
    });

    const received = handler.mock.calls[0][0] as DiagnosticEvent;
    expect(received.traceId).toBe('t1');
    expect(received.spanId).toBe('s1');
    expect(received.metadata).toEqual({ key: 'value' });
  });

  it('removeAllListeners clears everything when no arg', () => {
    const bus = new DiagnosticEventBus();
    const typed = vi.fn();
    const wildcard = vi.fn();
    bus.on('evt', typed);
    bus.on('*', wildcard);

    bus.removeAllListeners();
    bus.emit({ eventType: 'evt', timestamp: 1, level: 'info', message: 'm' });
    expect(typed).not.toHaveBeenCalled();
    expect(wildcard).not.toHaveBeenCalled();
  });

  it('removeAllListeners clears only wildcard when passed *', () => {
    const bus = new DiagnosticEventBus();
    const typed = vi.fn();
    const wildcard = vi.fn();
    bus.on('evt', typed);
    bus.on('*', wildcard);

    bus.removeAllListeners('*');
    bus.emit({ eventType: 'evt', timestamp: 1, level: 'info', message: 'm' });
    expect(typed).toHaveBeenCalledTimes(1);
    expect(wildcard).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { MemoryEventBus } from '../events';
import type { MemoryEntry } from '../types';

const sampleEntry: MemoryEntry = { id: 1, text: 'hello', metadata: {}, createdAt: Date.now(), updatedAt: Date.now() };

describe('MemoryEventBus', () => {
  it('should emit and record events', () => {
    const bus = new MemoryEventBus();
    bus.emitEvent('memory_inserted', sampleEntry);
    expect(bus.getEventCount()).toBe(1);
    expect(bus.getLastEvent()?.type).toBe('memory_inserted');
  });

  it('should notify typed listeners and return an unsubscribe', () => {
    const bus = new MemoryEventBus();
    const handler = vi.fn();
    const off = bus.onEvent('memory_searched', handler);
    bus.emitEvent('memory_searched', 'query');
    expect(handler).toHaveBeenCalledTimes(1);
    off();
    bus.emitEvent('memory_searched', 'query2');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should isolate listener errors', () => {
    const bus = new MemoryEventBus();
    bus.onEvent('memory_inserted', () => { throw new Error('bad'); });
    const good = vi.fn();
    bus.onEvent('memory_inserted', good);
    expect(() => bus.emitEvent('memory_inserted', sampleEntry)).not.toThrow();
    expect(good).toHaveBeenCalled();
  });

  it('should filter history by type and limit', () => {
    const bus = new MemoryEventBus();
    bus.emitEvent('memory_inserted', sampleEntry);
    bus.emitEvent('memory_deleted', 1);
    bus.emitEvent('memory_inserted', sampleEntry);
    expect(bus.getHistoryByType('memory_inserted').length).toBe(2);
    expect(bus.getEventCount('memory_inserted')).toBe(2);
    expect(bus.getHistory(1).length).toBe(1);
    expect(bus.getLastEvent('memory_inserted')?.type).toBe('memory_inserted');
  });

  it('should clear history', () => {
    const bus = new MemoryEventBus();
    bus.emitEvent('cleared');
    bus.clearHistory();
    expect(bus.getEventCount()).toBe(0);
  });
});

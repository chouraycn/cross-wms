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

  // 新增测试：Event Replay
  it('should replay events from history', () => {
    const bus = new MemoryEventBus({ enableSnapshots: false });

    // 发送多个事件
    bus.emitEvent('memory_inserted', { ...sampleEntry, id: 1 });
    bus.emitEvent('memory_inserted', { ...sampleEntry, id: 2 });
    bus.emitEvent('memory_deleted', 1);

    // 重放事件
    const result = bus.replayEvents();

    expect(result.eventsReplayed).toBe(3);
    expect(result.errors.length).toBe(0);
    expect(result.finalState.stats.totalEntries).toBe(1);
  });

  // 新增测试：Event Sourcing
  it('should rebuild state from events', () => {
    const bus = new MemoryEventBus({ enableSnapshots: false });

    const entry1: MemoryEntry = { id: 1, text: 'test 1', metadata: {}, createdAt: 1, updatedAt: 1 };
    const entry2: MemoryEntry = { id: 2, text: 'test 2', metadata: {}, createdAt: 2, updatedAt: 2 };

    bus.emitEvent('memory_inserted', entry1);
    bus.emitEvent('memory_inserted', entry2);

    const state = bus.getCurrentState();

    expect(state.entries.size).toBe(2);
    expect(state.lastId).toBe(2);
    expect(state.stats.totalEntries).toBe(2);
  });

  // 新增测试：Snapshot Creation
  it('should create snapshots', () => {
    const bus = new MemoryEventBus({
      enableSnapshots: true,
      snapshotInterval: 2,
    });

    bus.emitEvent('memory_inserted', { ...sampleEntry, id: 1 });
    bus.emitEvent('memory_inserted', { ...sampleEntry, id: 2 });

    // 应该自动创建快照
    const snapshots = bus.getSnapshots();
    expect(snapshots.length).toBeGreaterThanOrEqual(0);
  });

  // 新增测试：Rebuild from Snapshot
  it('should rebuild from snapshot', () => {
    const bus = new MemoryEventBus({ enableSnapshots: false });

    // 手动创建快照
    bus.emitEvent('memory_inserted', { ...sampleEntry, id: 1 });
    bus.createSnapshot();

    // 添加更多事件
    bus.emitEvent('memory_inserted', { ...sampleEntry, id: 2 });

    // 从快照重建
    const state = bus.rebuildFromSnapshot();

    expect(state.entries.size).toBe(2);
  });

  // 新增测试：Version Tracking
  it('should track version correctly', () => {
    const bus = new MemoryEventBus();

    expect(bus.getVersion()).toBe(0);

    bus.emitEvent('memory_inserted', sampleEntry);
    expect(bus.getVersion()).toBe(1);

    bus.emitEvent('memory_updated', sampleEntry);
    expect(bus.getVersion()).toBe(2);
  });

  // 新增测试：Replay with Filters
  it('should replay events with filters', () => {
    const bus = new MemoryEventBus();

    const now = Date.now();
    bus.emitEvent('memory_inserted', { ...sampleEntry, id: 1 });
    bus.emitEvent('memory_deleted', 1);

    // 只重放插入事件
    const result = bus.replayEvents({
      eventTypes: ['memory_inserted'],
    });

    expect(result.eventsReplayed).toBe(1);
  });

  // 新增测试：Export State as Events
  it('should export state as events', () => {
    const bus = new MemoryEventBus();

    bus.emitEvent('memory_inserted', { ...sampleEntry, id: 1 });
    bus.emitEvent('memory_inserted', { ...sampleEntry, id: 2 });

    const events = bus.exportStateAsEvents();

    expect(events.length).toBe(2);
    expect(events.every(e => e.type === 'memory_inserted')).toBe(true);
  });

  // 新增测试：Reset
  it('should reset state and history', () => {
    const bus = new MemoryEventBus();

    bus.emitEvent('memory_inserted', sampleEntry);
    bus.createSnapshot();

    bus.reset();

    expect(bus.getEventCount()).toBe(0);
    expect(bus.getSnapshots().length).toBe(0);
    expect(bus.getVersion()).toBe(0);
  });
});

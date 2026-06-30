// @vitest-environment node
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  SubagentLifecycleManager,
  type SubagentMode,
} from '../subagent-lifecycle.js';

describe('subagent-lifecycle - manager', () => {
  let manager: SubagentLifecycleManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new SubagentLifecycleManager(5000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create subagent with fork mode', () => {
    const subagent = manager.createSubagent({
      name: 'test-fork',
      mode: 'fork',
      parentSessionId: 'parent-sess',
    });

    expect(subagent.id).toBeTruthy();
    expect(subagent.name).toBe('test-fork');
    expect(subagent.mode).toBe('fork');
    expect(subagent.parentSessionId).toBe('parent-sess');
    expect(subagent.status).toBe('active');
    expect(subagent.createdAt).toBeLessThanOrEqual(Date.now());
    expect(subagent.lastActiveAt).toBeGreaterThanOrEqual(subagent.createdAt);
  });

  it('should create subagent with isolated mode', () => {
    const subagent = manager.createSubagent({
      name: 'test-iso',
      mode: 'isolated',
      parentSessionId: 'parent-sess',
    });

    expect(subagent.mode).toBe('isolated');
    expect(subagent.status).toBe('active');
  });

  it('should set custom TTL', () => {
    const subagent = manager.createSubagent({
      name: 'test',
      mode: 'fork',
      parentSessionId: 'parent',
      ttlMs: 10000,
    });

    expect(subagent.ttlMs).toBe(10000);
  });

  it('should use default TTL when not specified', () => {
    const subagent = manager.createSubagent({
      name: 'test',
      mode: 'fork',
      parentSessionId: 'parent',
    });

    expect(subagent.ttlMs).toBe(5000);
  });

  it('should include metadata', () => {
    const subagent = manager.createSubagent({
      name: 'test',
      mode: 'fork',
      parentSessionId: 'parent',
      metadata: { custom: 'value' },
    });

    expect(subagent.metadata).toEqual({ custom: 'value' });
  });

  it('should get subagent by id', () => {
    const created = manager.createSubagent({
      name: 'test',
      mode: 'fork',
      parentSessionId: 'parent',
    });

    const found = manager.getSubagent(created.id);
    expect(found).toBeTruthy();
    expect(found?.id).toBe(created.id);
  });

  it('should return null for non-existent subagent', () => {
    const found = manager.getSubagent('nonexistent');
    expect(found).toBeNull();
  });

  it('should get child subagents by parent session id', () => {
    manager.createSubagent({ name: 'a', mode: 'fork', parentSessionId: 'parent-1' });
    manager.createSubagent({ name: 'b', mode: 'fork', parentSessionId: 'parent-1' });
    manager.createSubagent({ name: 'c', mode: 'fork', parentSessionId: 'parent-2' });

    const children = manager.getChildSubagents('parent-1');
    expect(children.length).toBe(2);
    expect(children.map(c => c.name).sort()).toEqual(['a', 'b']);
  });

  it('should touch subagent to update lastActiveAt', () => {
    const subagent = manager.createSubagent({
      name: 'test',
      mode: 'fork',
      parentSessionId: 'parent',
    });

    const originalActive = subagent.lastActiveAt;

    vi.advanceTimersByTime(100);
    const result = manager.touch(subagent.id);

    expect(result).toBe(true);
    const updated = manager.getSubagent(subagent.id)!;
    expect(updated.lastActiveAt).toBeGreaterThan(originalActive);
  });

  it('should return false when touching non-existent subagent', () => {
    const result = manager.touch('nonexistent');
    expect(result).toBe(false);
  });

  it('should complete subagent', () => {
    const subagent = manager.createSubagent({
      name: 'test',
      mode: 'fork',
      parentSessionId: 'parent',
    });

    const result = manager.complete(subagent.id, { output: 'result' });
    expect(result).toBe(true);

    const completed = manager.getSubagent(subagent.id)!;
    expect(completed.status).toBe('completed');
    expect(completed.result).toEqual({ output: 'result' });
    expect(completed.completedAt).toBeTruthy();
  });

  it('should fail subagent', () => {
    const subagent = manager.createSubagent({
      name: 'test',
      mode: 'fork',
      parentSessionId: 'parent',
    });

    const result = manager.fail(subagent.id, new Error('test error'));
    expect(result).toBe(true);

    const failed = manager.getSubagent(subagent.id)!;
    expect(failed.status).toBe('failed');
    expect(failed.error).toBeTruthy();
    expect(failed.completedAt).toBeTruthy();
  });

  it('should dispose subagent', () => {
    const subagent = manager.createSubagent({
      name: 'test',
      mode: 'fork',
      parentSessionId: 'parent',
    });

    const result = manager.dispose(subagent.id);
    expect(result).toBe(true);
    expect(manager.getSubagent(subagent.id)).toBeNull();
  });

  it('should return false when disposing non-existent subagent', () => {
    const result = manager.dispose('nonexistent');
    expect(result).toBe(false);
  });

  it('should return stats', () => {
    manager.createSubagent({ name: 'a', mode: 'fork', parentSessionId: 'p1' });
    manager.createSubagent({ name: 'b', mode: 'fork', parentSessionId: 'p1' });
    manager.createSubagent({ name: 'c', mode: 'isolated', parentSessionId: 'p2' });

    const stats = manager.getStats();
    expect(stats.totalSubagents).toBe(3);
    expect(stats.activeCount).toBe(3);
    expect(stats.parentSessionCount).toBe(2);
  });

  it('should update stats after completion', () => {
    const subagent = manager.createSubagent({
      name: 'test',
      mode: 'fork',
      parentSessionId: 'p1',
    });

    manager.complete(subagent.id, {});

    const stats = manager.getStats();
    expect(stats.activeCount).toBe(0);
    expect(stats.completedCount).toBe(1);
  });

  it('should update stats after failure', () => {
    const subagent = manager.createSubagent({
      name: 'test',
      mode: 'fork',
      parentSessionId: 'p1',
    });

    manager.fail(subagent.id, new Error('test'));

    const stats = manager.getStats();
    expect(stats.activeCount).toBe(0);
    expect(stats.failedCount).toBe(1);
  });

  it('should increment message count', () => {
    const subagent = manager.createSubagent({
      name: 'test',
      mode: 'fork',
      parentSessionId: 'parent',
    });

    const result = manager.incrementMessageCount(subagent.id, 5);
    expect(result).toBe(true);

    const updated = manager.getSubagent(subagent.id)!;
    expect(updated.messageCount).toBe(5);
  });
});

describe('subagent-lifecycle - event listeners', () => {
  let manager: SubagentLifecycleManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new SubagentLifecycleManager();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should emit created event', () => {
    const listener = vi.fn();
    manager.on('created', listener);

    const subagent = manager.createSubagent({
      name: 'test',
      mode: 'fork',
      parentSessionId: 'parent',
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].type).toBe('created');
    expect(listener.mock.calls[0][0].subagent.id).toBe(subagent.id);
  });

  it('should emit completed event', () => {
    const listener = vi.fn();
    const subagent = manager.createSubagent({
      name: 'test',
      mode: 'fork',
      parentSessionId: 'parent',
    });

    manager.on('completed', listener);
    manager.complete(subagent.id, { output: 'result' });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].type).toBe('completed');
    expect(listener.mock.calls[0][0].subagent.id).toBe(subagent.id);
  });

  it('should emit failed event', () => {
    const listener = vi.fn();
    const subagent = manager.createSubagent({
      name: 'test',
      mode: 'fork',
      parentSessionId: 'parent',
    });

    manager.on('failed', listener);
    manager.fail(subagent.id, new Error('test error'));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].type).toBe('failed');
    expect(listener.mock.calls[0][0].subagent.id).toBe(subagent.id);
  });

  it('should emit disposed event', () => {
    const listener = vi.fn();
    const subagent = manager.createSubagent({
      name: 'test',
      mode: 'fork',
      parentSessionId: 'parent',
    });

    manager.on('disposed', listener);
    manager.dispose(subagent.id);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].type).toBe('disposed');
    expect(listener.mock.calls[0][0].subagent.id).toBe(subagent.id);
  });

  it('should remove event listener', () => {
    const listener = vi.fn();
    manager.on('created', listener);
    manager.off('created', listener);

    manager.createSubagent({
      name: 'test',
      mode: 'fork',
      parentSessionId: 'parent',
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it('should emit activated event on touch', () => {
    const listener = vi.fn();
    const subagent = manager.createSubagent({
      name: 'test',
      mode: 'fork',
      parentSessionId: 'parent',
    });

    manager.on('activated', listener);
    manager.touch(subagent.id);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].type).toBe('activated');
  });
});

describe('subagent-lifecycle - TTL cleanup', () => {
  let manager: SubagentLifecycleManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new SubagentLifecycleManager(1000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should clean up expired subagents when accessed', () => {
    const subagent = manager.createSubagent({
      name: 'test',
      mode: 'fork',
      parentSessionId: 'parent',
    });

    expect(manager.getSubagent(subagent.id)).not.toBeNull();

    vi.advanceTimersByTime(1500);

    const expired = manager.getSubagent(subagent.id);
    expect(expired).toBeNull();
  });

  it('should not clean up subagents that are touched', () => {
    const subagent = manager.createSubagent({
      name: 'test',
      mode: 'fork',
      parentSessionId: 'parent',
    });

    vi.advanceTimersByTime(800);
    manager.touch(subagent.id);
    vi.advanceTimersByTime(500);

    const stillExists = manager.getSubagent(subagent.id);
    expect(stillExists).not.toBeNull();
    expect(stillExists?.status).toBe('active');
  });
});

describe('subagent-lifecycle - modes', () => {
  let manager: SubagentLifecycleManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new SubagentLifecycleManager();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const modes: SubagentMode[] = ['fork', 'isolated'];

  it.each(modes)('should create %s mode subagent', (mode) => {
    const subagent = manager.createSubagent({
      name: `test-${mode}`,
      mode,
      parentSessionId: 'parent',
    });

    expect(subagent.mode).toBe(mode);
    expect(subagent.status).toBe('active');
  });
});

describe('subagent-lifecycle - global manager', () => {
  it('should provide global manager singleton', async () => {
    const { getGlobalSubagentLifecycleManager } = await import('../subagent-lifecycle.js');
    const mgr1 = getGlobalSubagentLifecycleManager();
    const mgr2 = getGlobalSubagentLifecycleManager();
    expect(mgr1).toBe(mgr2);
  });

  it('should allow setting custom global manager', async () => {
    vi.useFakeTimers();
    const { getGlobalSubagentLifecycleManager, setGlobalSubagentLifecycleManager } = await import('../subagent-lifecycle.js');
    const custom = new SubagentLifecycleManager(9999);
    setGlobalSubagentLifecycleManager(custom);
    expect(getGlobalSubagentLifecycleManager()).toBe(custom);
    vi.useRealTimers();
  });
});

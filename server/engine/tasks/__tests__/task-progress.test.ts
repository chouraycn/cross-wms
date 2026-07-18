import { describe, it, expect } from 'vitest';
import {
  mergeProgress,
  aggregateSubtaskProgress,
  ProgressTracker,
} from '../task-progress.js';
import type { Task } from '../types.js';

function makeTask(): Task {
  return {
    id: 't1', name: 't1', status: 'running', priority: 'medium', dependencies: [],
    timeoutMs: 0, maxRetries: 0, retryCount: 0, tags: [], metadata: {},
    createdAt: new Date().toISOString(), queuedAt: null, startedAt: null,
    completedAt: null, progress: null, result: null, error: null,
  };
}

describe('task-progress', () => {
  it('mergeProgress 覆盖并钳制 percent', () => {
    const r = mergeProgress({ percent: 20, phase: 'init' }, { percent: 200 });
    expect(r.percent).toBe(100);
    expect(r.phase).toBe('init');
  });

  it('mergeProgress null 基底使用默认', () => {
    const r = mergeProgress(null, { percent: 30, phase: 'loading' });
    expect(r.percent).toBe(30);
    expect(r.phase).toBe('loading');
  });

  it('aggregateSubtaskProgress 按完成比例计算', () => {
    const subs = [
      { status: 'completed' }, { status: 'completed' }, { status: 'failed' }, { status: 'pending' },
    ];
    const r = aggregateSubtaskProgress(subs, 'build');
    expect(r.subtasks).toEqual({ total: 4, completed: 2, failed: 1 });
    expect(r.percent).toBe(75); // 3/4 done
    expect(r.phase).toBe('build');
  });

  it('aggregateSubtaskProgress 空列表 percent 为 0', () => {
    const r = aggregateSubtaskProgress([]);
    expect(r.percent).toBe(0);
    expect(r.subtasks!.total).toBe(0);
  });

  it('ProgressTracker 同步到 task', () => {
    const task = makeTask();
    const tracker = new ProgressTracker();
    tracker.attach(task);
    tracker.setPercent(50, 'half');
    expect(task.progress?.percent).toBe(50);
    tracker.complete('done');
    expect(task.progress?.percent).toBe(100);
    expect(tracker.snapshot()?.percent).toBe(100);
  });

  it('ProgressTracker reset 清空', () => {
    const task = makeTask();
    const tracker = new ProgressTracker();
    tracker.attach(task);
    tracker.setPercent(40);
    tracker.reset();
    expect(tracker.snapshot()).toBeNull();
    expect(task.progress).toBeNull();
  });

  it('ProgressTracker detach 返回原 task', () => {
    const task = makeTask();
    const tracker = new ProgressTracker();
    tracker.attach(task);
    expect(tracker.detach()).toBe(task);
  });
});

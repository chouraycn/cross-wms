import { describe, it, expect } from 'vitest';
import {
  comparePriority,
  compareTaskPriority,
  sortByPriority,
  shiftPriority,
  promotePriority,
  demotePriority,
  inheritPriority,
  clampPriority,
  detailedCompare,
} from '../task-priority.js';
import type { Task, TaskPriority } from '../types.js';

function makeTask(id: string, priority: TaskPriority): Task {
  return {
    id, name: id, status: 'pending', priority, dependencies: [],
    timeoutMs: 0, maxRetries: 0, retryCount: 0, tags: [], metadata: {},
    createdAt: new Date().toISOString(), queuedAt: null, startedAt: null,
    completedAt: null, progress: null, result: null, error: null,
  };
}

describe('task-priority', () => {
  it('comparePriority 高优先级返回正数', () => {
    expect(comparePriority('critical', 'low')).toBeGreaterThan(0);
    expect(comparePriority('low', 'high')).toBeLessThan(0);
    expect(comparePriority('medium', 'medium')).toBe(0);
  });

  it('compareTaskPriority 比较任务优先级', () => {
    const a = makeTask('a', 'high');
    const b = makeTask('b', 'low');
    expect(compareTaskPriority(a, b)).toBeGreaterThan(0);
  });

  it('sortByPriority 从高到低排序', () => {
    const arr = [makeTask('a', 'low'), makeTask('b', 'critical'), makeTask('c', 'medium')];
    sortByPriority(arr);
    expect(arr.map(t => t.id)).toEqual(['b', 'c', 'a']);
  });

  it('shiftPriority 提升并钳制到 critical', () => {
    expect(shiftPriority('medium', 1)).toBe('high');
    expect(shiftPriority('critical', 1)).toBe('critical'); // 已到顶
    expect(shiftPriority('low', -1)).toBe('low'); // 已到底
  });

  it('promotePriority / demotePriority', () => {
    expect(promotePriority('low')).toBe('medium');
    expect(demotePriority('high')).toBe('medium');
    expect(promotePriority('critical')).toBe('critical');
  });

  it('inheritPriority 提升到阻塞者最高优先级', () => {
    const task = makeTask('t', 'low');
    const blockers = [makeTask('b1', 'medium'), makeTask('b2', 'critical')];
    const changed = inheritPriority(task, blockers);
    expect(changed).toBe(true);
    expect(task.priority).toBe('critical');
  });

  it('inheritPriority 无更高优先级时不改变', () => {
    const task = makeTask('t', 'critical');
    const changed = inheritPriority(task, [makeTask('b', 'low')]);
    expect(changed).toBe(false);
    expect(task.priority).toBe('critical');
  });

  it('clampPriority 非法值降级 medium', () => {
    expect(clampPriority('unknown')).toBe('medium');
    expect(clampPriority('high')).toBe('high');
  });

  it('detailedCompare 返回 diff', () => {
    const r = detailedCompare('critical', 'low');
    expect(r.a).toBe('critical');
    expect(r.b).toBe('low');
    expect(r.diff).toBeGreaterThan(0);
  });
});

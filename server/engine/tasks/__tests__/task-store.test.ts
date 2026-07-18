import { describe, it, expect } from 'vitest';
import { TaskStore } from '../task-store.js';
import type { Task } from '../types.js';

describe('TaskStore', () => {
  it('create 创建任务并默认 pending', () => {
    const store = new TaskStore();
    const t = store.create({ name: 't1', tags: ['x'] });
    expect(t.status).toBe('pending');
    expect(t.id).toBeTruthy();
    expect(t.tags).toEqual(['x']);
    expect(store.size).toBe(1);
  });

  it('create 重复 id 抛错', () => {
    const store = new TaskStore();
    store.create({ id: 'fixed', name: 't1' });
    expect(() => store.create({ id: 'fixed', name: 't2' })).toThrow();
  });

  it('get / has / delete', () => {
    const store = new TaskStore();
    const t = store.create({ id: 'a', name: 'a' });
    expect(store.has('a')).toBe(true);
    expect(store.get('a')!.name).toBe('a');
    expect(store.delete('a')).toBe(true);
    expect(store.has('a')).toBe(false);
    expect(store.delete('a')).toBe(false);
  });

  it('update 维护状态索引', () => {
    const store = new TaskStore();
    const t = store.create({ id: 'a', name: 'a' });
    store.update('a', { status: 'running' });
    expect(store.query({ status: 'running' }).map(t => t.id)).toEqual(['a']);
    expect(store.query({ status: 'pending' })).toHaveLength(0);
  });

  it('query 按 tag 查询', () => {
    const store = new TaskStore();
    store.create({ id: 'a', name: 'a', tags: ['ui', 'web'] });
    store.create({ id: 'b', name: 'b', tags: ['web'] });
    store.create({ id: 'c', name: 'c', tags: ['api'] });
    expect(store.query({ tag: 'web' }).map(t => t.id).sort()).toEqual(['a', 'b']);
  });

  it('query 多条件交集', () => {
    const store = new TaskStore();
    store.create({ id: 'a', name: 'a', tags: ['web'], priority: 'high' });
    store.create({ id: 'b', name: 'b', tags: ['web'], priority: 'low' });
    const r = store.query({ tag: 'web', priority: 'high' });
    expect(r.map(t => t.id)).toEqual(['a']);
  });

  it('countByStatus 与 snapshot', () => {
    const store = new TaskStore();
    store.create({ id: 'a', name: 'a' });
    store.create({ id: 'b', name: 'b' });
    store.update('a', { status: 'completed' });
    const counts = store.countByStatus();
    expect(counts.completed).toBe(1);
    expect(counts.pending).toBe(1);
    const snap = store.snapshot();
    expect(snap).toHaveLength(2);
    expect(snap[0]).not.toBe(store.get('a')); // 深拷贝
  });

  it('insert 插入已有 Task 对象', () => {
    const store = new TaskStore();
    const task: Task = {
      id: 'ext', name: 'ext', status: 'completed', priority: 'high', dependencies: [],
      timeoutMs: 0, maxRetries: 0, retryCount: 0, tags: [], metadata: {},
      createdAt: new Date().toISOString(), queuedAt: null, startedAt: null,
      completedAt: null, progress: null, result: null, error: null,
    };
    store.insert(task);
    expect(store.get('ext')!.status).toBe('completed');
  });
});

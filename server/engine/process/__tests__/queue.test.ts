import { describe, it, expect } from 'vitest';
import { TaskQueue } from '../queue.js';
import type { ProcessPriority } from '../types.js';

describe('TaskQueue', () => {
  it('capacity 必须 > 0', () => {
    expect(() => new TaskQueue(0)).toThrow();
    expect(() => new TaskQueue(-1)).toThrow();
    expect(() => new TaskQueue(NaN)).toThrow();
  });

  it('enqueue 后 size 增加', () => {
    const q = new TaskQueue<number>(1);
    q.enqueue('t1', async () => 1);
    expect(q.size()).toBe(1);
    expect(q.activeCount()).toBe(0);
  });

  it('重复 id 入队报错', () => {
    const q = new TaskQueue<number>(2);
    q.enqueue('t1', async () => 1);
    expect(() => q.enqueue('t1', async () => 2)).toThrow();
  });

  it('cancel 移除未开始的条目', () => {
    const q = new TaskQueue<number>(2);
    q.enqueue('t1', async () => 1);
    expect(q.cancel('t1')).toBe(true);
    expect(q.size()).toBe(0);
    expect(q.cancel('nonexistent')).toBe(false);
  });

  it('acquire/release 维护 active 数', async () => {
    const q = new TaskQueue<number>(2);
    const release = await q.acquire('a1');
    expect(q.activeCount()).toBe(1);
    release();
    expect(q.activeCount()).toBe(0);
  });

  it('优先级高的先出队', async () => {
    const q = new TaskQueue<number>(1);
    // 占用槽位，避免 dequeue 触发后续行为
    const release = await q.acquire('holder');
    const out: string[] = [];
    q.enqueue('low', async () => { out.push('low'); return 1; }, { priority: 'low' });
    q.enqueue('critical', async () => { out.push('critical'); return 2; }, { priority: 'critical' });
    q.enqueue('normal', async () => { out.push('normal'); return 3; }, { priority: 'normal' });
    release();
    // dequeue 按优先级
    const e1 = await q.dequeue();
    expect(e1.id).toBe('critical');
  });

  it('同优先级按入队顺序', async () => {
    const q = new TaskQueue<number>(1);
    await q.acquire('holder');
    q.enqueue('a', async () => 1, { priority: 'normal' });
    q.enqueue('b', async () => 2, { priority: 'normal' });
    q.enqueue('c', async () => 3, { priority: 'normal' });
    const e1 = await q.dequeue();
    expect(e1.id).toBe('a');
    const e2 = await q.dequeue();
    expect(e2.id).toBe('b');
  });

  it('status 返回快照', () => {
    const q = new TaskQueue<number>(3);
    q.enqueue('t1', async () => 1);
    const status = q.status();
    expect(status).toEqual({ queuedCount: 1, activeCount: 0, capacity: 3 });
  });

  it('has 检查 id 存在', () => {
    const q = new TaskQueue<number>(1);
    q.enqueue('t1', async () => 1);
    expect(q.has('t1')).toBe(true);
    expect(q.has('t2')).toBe(false);
  });

  it('clear 清空所有等待条目', () => {
    const q = new TaskQueue<number>(1);
    q.enqueue('t1', async () => 1);
    q.enqueue('t2', async () => 2);
    expect(q.clear()).toBe(2);
    expect(q.size()).toBe(0);
  });

  it('release 唤醒等待中的 acquire', async () => {
    const q = new TaskQueue<number>(1);
    const release = await q.acquire('first');
    let acquired = false;
    void q.acquire('second').then(() => {
      acquired = true;
    });
    release();
    // 微任务推一下
    await Promise.resolve();
    await Promise.resolve();
    expect(acquired).toBe(true);
  });
});

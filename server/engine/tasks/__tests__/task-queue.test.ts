import { describe, it, expect } from 'vitest';
import { PriorityQueue, DelayedQueue, DeadLetterQueue } from '../task-queue.js';
import type { Task } from '../types.js';

function makeTask(id: string, priority: Task['priority'] = 'medium'): Task {
  return {
    id, name: id, status: 'pending', priority, dependencies: [],
    timeoutMs: 0, maxRetries: 0, retryCount: 0, tags: [], metadata: {},
    createdAt: new Date().toISOString(), queuedAt: null, startedAt: null,
    completedAt: null, progress: null, result: null, error: null,
  };
}

describe('PriorityQueue', () => {
  it('按优先级出队', () => {
    const q = new PriorityQueue();
    q.enqueue(makeTask('low', 'low'));
    q.enqueue(makeTask('crit', 'critical'));
    q.enqueue(makeTask('med', 'medium'));
    expect(q.dequeue()!.id).toBe('crit');
    expect(q.dequeue()!.id).toBe('med');
    expect(q.dequeue()!.id).toBe('low');
  });

  it('同优先级 FIFO', () => {
    const q = new PriorityQueue();
    q.enqueue(makeTask('a'));
    q.enqueue(makeTask('b'));
    q.enqueue(makeTask('c'));
    expect(q.dequeue()!.id).toBe('a');
    expect(q.dequeue()!.id).toBe('b');
    expect(q.dequeue()!.id).toBe('c');
  });

  it('重复 ID 入队返回 false', () => {
    const q = new PriorityQueue();
    expect(q.enqueue(makeTask('a'))).toBe(true);
    expect(q.enqueue(makeTask('a'))).toBe(false);
  });

  it('peek 不移除', () => {
    const q = new PriorityQueue();
    q.enqueue(makeTask('a', 'high'));
    expect(q.peek()!.id).toBe('a');
    expect(q.size).toBe(1);
  });

  it('remove 移除指定任务', () => {
    const q = new PriorityQueue();
    q.enqueue(makeTask('a'));
    q.enqueue(makeTask('b'));
    expect(q.remove('a')).toBe(true);
    expect(q.has('a')).toBe(false);
    expect(q.size).toBe(1);
  });

  it('clear 清空', () => {
    const q = new PriorityQueue();
    q.enqueue(makeTask('a'));
    q.enqueue(makeTask('b'));
    q.clear();
    expect(q.size).toBe(0);
    expect(q.dequeue()).toBeNull();
  });
});

describe('DelayedQueue', () => {
  it('未到时间不出队', () => {
    const q = new DelayedQueue();
    q.enqueue(makeTask('a'), 1000);
    expect(q.dequeueReady(0)).toHaveLength(0);
    expect(q.size).toBe(1);
  });

  it('到时间出队', () => {
    const q = new DelayedQueue();
    const now = Date.now();
    q.enqueue(makeTask('a'), 500); // readyAt = now + 500
    expect(q.dequeueReady(now + 1000)).toHaveLength(1);
  });

  it('nextReadyAt 返回最早就绪时间', () => {
    const q = new DelayedQueue();
    expect(q.nextReadyAt()).toBeNull();
    q.enqueue(makeTask('a'), 1000);
    q.enqueue(makeTask('b'), 500);
    const next = q.nextReadyAt()!;
    expect(next).toBeGreaterThan(Date.now());
  });
});

describe('DeadLetterQueue', () => {
  it('enqueue 与 list', () => {
    const dlq = new DeadLetterQueue();
    dlq.enqueue(makeTask('a'), 'max retries');
    expect(dlq.size).toBe(1);
    expect(dlq.list()[0].reason).toBe('max retries');
  });

  it('redeliver 移除并返回任务', () => {
    const dlq = new DeadLetterQueue();
    dlq.enqueue(makeTask('a'), 'failed');
    expect(dlq.redeliver('a')!.id).toBe('a');
    expect(dlq.size).toBe(0);
    expect(dlq.redeliver('missing')).toBeNull();
  });

  it('超过 maxSize 时移除最旧', () => {
    const dlq = new DeadLetterQueue(2);
    dlq.enqueue(makeTask('a'), 'r');
    dlq.enqueue(makeTask('b'), 'r');
    dlq.enqueue(makeTask('c'), 'r');
    expect(dlq.size).toBe(2);
    expect(dlq.list().map(e => e.task.id)).toEqual(['b', 'c']);
  });
});

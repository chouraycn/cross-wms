import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    isLevelEnabled: vi.fn(() => false),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

import { InvocationQueue, createInvocationQueue } from '../invocation-queue.js';
import type { ExecutionResult } from '../types.js';

function makeResult(invocationId: string, success = true): ExecutionResult {
  return {
    invocationId,
    exitCode: success ? 0 : 1,
    stdout: success ? 'ok' : '',
    stderr: success ? '' : 'error',
    durationMs: 10,
    timedOut: false,
    success,
    truncated: false,
  };
}

describe('node-host/invocation-queue', () => {
  let queue: InvocationQueue;

  beforeEach(() => {
    queue = createInvocationQueue({ maxConcurrent: 2, maxSize: 10 });
  });

  describe('enqueue', () => {
    it('成功入队并执行', async () => {
      const result = await queue.enqueue(
        { command: 'echo', args: ['hello'] },
        () => Promise.resolve(makeResult('test-1')),
      );
      expect(result.success).toBe(true);
      expect(result.invocationId).toBeDefined();
    });

    it('自动生成 invocation id', async () => {
      const result = await queue.enqueue(
        { command: 'echo', args: ['hi'] },
        () => Promise.resolve(makeResult('auto')),
      );
      expect(result.invocationId).toMatch(/^inv-/);
    });

    it('队列满时抛出错误', async () => {
      queue = createInvocationQueue({ maxSize: 1, maxConcurrent: 1 });

      let resolveFirst: () => void;
      const firstPromise = queue.enqueue(
        { command: 'a', args: [] },
        () => new Promise(resolve => {
          resolveFirst = () => resolve(makeResult('a'));
        }),
      );

      const secondPromise = queue.enqueue(
        { command: 'b', args: [] },
        () => new Promise(resolve => {
          resolve(makeResult('b'));
        }),
      );

      await new Promise(r => setTimeout(r, 10));

      const thirdPromise = queue.enqueue(
        { command: 'c', args: [] },
        () => Promise.resolve(makeResult('c')),
      );

      await expect(thirdPromise).rejects.toThrow('Queue is full');

      resolveFirst!();
      await firstPromise;
      await secondPromise;
    });
  });

  describe('并发控制', () => {
    it('限制最大并发数', async () => {
      let runningCount = 0;
      let maxRunning = 0;

      const tasks = Array.from({ length: 5 }, (_, i) =>
        queue.enqueue(
          { command: `task-${i}`, args: [] },
          async () => {
            runningCount++;
            maxRunning = Math.max(maxRunning, runningCount);
            await new Promise(resolve => setTimeout(resolve, 10));
            runningCount--;
            return makeResult(`task-${i}`);
          },
        ),
      );

      await Promise.all(tasks);
      expect(maxRunning).toBeLessThanOrEqual(2);
    });
  });

  describe('优先级', () => {
    it('高优先级任务先执行', async () => {
      const executionOrder: string[] = [];
      const started: Array<() => void> = [];

      queue = createInvocationQueue({ maxConcurrent: 1, maxSize: 10 });

      const firstTask = queue.enqueue(
        { command: 'first', args: [], priority: 0 },
        async () => {
          return new Promise(resolve => {
            started.push(() => {
              executionOrder.push('first');
              resolve(makeResult('first'));
            });
          });
        },
      );

      await new Promise(r => setTimeout(r, 10));

      const lowTask = queue.enqueue(
        { command: 'low', args: [], priority: 1 },
        () => {
          executionOrder.push('low');
          return Promise.resolve(makeResult('low'));
        },
      );

      const highTask = queue.enqueue(
        { command: 'high', args: [], priority: 10 },
        () => {
          executionOrder.push('high');
          return Promise.resolve(makeResult('high'));
        },
      );

      started[0]();

      await firstTask;
      await highTask;
      await lowTask;

      expect(executionOrder).toEqual(['first', 'high', 'low']);
    });
  });

  describe('cancel', () => {
    it('取消 pending 任务', async () => {
      queue = createInvocationQueue({ maxConcurrent: 0, maxSize: 10 });

      const taskPromise = queue.enqueue(
        { command: 'test', args: [] },
        () => Promise.resolve(makeResult('test')),
      );

      await new Promise(r => setTimeout(r, 10));
      const ids = queue.getPendingInvocationIds();
      expect(ids.length).toBe(1);

      const cancelled = queue.cancel(ids[0]);
      expect(cancelled).toBe(true);

      await expect(taskPromise).rejects.toThrow('Invocation cancelled');
    });

    it('取消不存在的任务返回 false', () => {
      expect(queue.cancel('nonexistent')).toBe(false);
    });
  });

  describe('统计', () => {
    it('getStats 返回正确统计', async () => {
      await queue.enqueue(
        { command: 'ok', args: [] },
        () => Promise.resolve(makeResult('ok')),
      );
      await queue.enqueue(
        { command: 'fail', args: [] },
        () => Promise.resolve(makeResult('fail', false)),
      );

      const stats = queue.getStats();
      expect(stats.completed).toBe(1);
      expect(stats.failed).toBe(1);
      expect(stats.totalProcessed).toBe(2);
      expect(stats.averageDurationMs).toBeGreaterThan(0);
      expect(stats.pending).toBe(0);
      expect(stats.running).toBe(0);
    });

    it('getPendingCount / getRunningCount', () => {
      expect(queue.getPendingCount()).toBe(0);
      expect(queue.getRunningCount()).toBe(0);
    });
  });

  describe('配置', () => {
    it('getMaxConcurrent 返回设置', () => {
      expect(queue.getMaxConcurrent()).toBe(2);
    });

    it('setMaxConcurrent 调整并发数', async () => {
      queue.setMaxConcurrent(5);
      expect(queue.getMaxConcurrent()).toBe(5);
    });

    it('getMaxSize 返回最大队列大小', () => {
      expect(queue.getMaxSize()).toBe(10);
    });
  });

  describe('clear', () => {
    it('清空队列', async () => {
      queue = createInvocationQueue({ maxConcurrent: 0, maxSize: 10 });
      const p1 = queue.enqueue(
        { command: 'a', args: [] },
        () => Promise.resolve(makeResult('a')),
      );
      const p2 = queue.enqueue(
        { command: 'b', args: [] },
        () => Promise.resolve(makeResult('b')),
      );

      await new Promise(r => setTimeout(r, 10));
      queue.clear();

      await expect(p1).rejects.toThrow('Queue cleared');
      await expect(p2).rejects.toThrow('Queue cleared');
      expect(queue.getPendingCount()).toBe(0);
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FollowupRunner, createFollowupRunner, type FollowupTask } from '../followup-runner.js';

describe('followup-runner', () => {
  let runner: FollowupRunner;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (runner) {
      runner.dispose();
    }
    vi.useRealTimers();
  });

  describe('FollowupRunner', () => {
    it('should schedule and execute a task', async () => {
      let executed = false;
      runner = createFollowupRunner({
        defaultDelayMs: 100,
        runTask: async () => {
          executed = true;
          return { text: 'done' };
        },
      });

      const taskId = runner.schedule({
        id: 'test-1',
        sessionKey: 'session-1',
        prompt: 'test prompt',
        delayMs: 100,
      });

      expect(taskId).toBe('test-1');
      expect(runner.getActiveCount()).toBe(1);
      expect(executed).toBe(false);

      await vi.advanceTimersByTimeAsync(150);
      expect(executed).toBe(true);
      expect(runner.getActiveCount()).toBe(0);
    });

    it('should call onResult callback', async () => {
      const onResult = vi.fn();
      runner = createFollowupRunner({
        defaultDelayMs: 100,
        onResult,
        runTask: async () => ({ text: 'result' }),
      });

      runner.schedule({
        id: 'test-1',
        sessionKey: 'session-1',
        prompt: 'test',
        delayMs: 100,
      });

      await vi.advanceTimersByTimeAsync(150);
      expect(onResult).toHaveBeenCalled();
      expect(onResult.mock.calls[0][0].success).toBe(true);
      expect(onResult.mock.calls[0][0].taskId).toBe('test-1');
    });

    it('should retry on failure', async () => {
      let attempt = 0;
      const onResult = vi.fn();
      runner = createFollowupRunner({
        defaultDelayMs: 100,
        onResult,
        runTask: async () => {
          attempt++;
          if (attempt < 3) throw new Error('fail');
          return { text: 'success' };
        },
      });

      runner.schedule({
        id: 'test-retry',
        sessionKey: 'session-1',
        prompt: 'test',
        delayMs: 50,
        maxRetries: 3,
      });

      await vi.advanceTimersByTimeAsync(100);
      expect(attempt).toBe(1);

      await vi.advanceTimersByTimeAsync(1000);
      expect(attempt).toBe(2);

      await vi.advanceTimersByTimeAsync(2000);
      expect(attempt).toBe(3);
    });

    it('should cancel a task', () => {
      let executed = false;
      runner = createFollowupRunner({
        defaultDelayMs: 1000,
        runTask: async () => {
          executed = true;
          return { text: 'done' };
        },
      });

      const taskId = runner.schedule({
        id: 'cancel-me',
        sessionKey: 'session-1',
        prompt: 'test',
        delayMs: 1000,
      });

      expect(runner.getActiveCount()).toBe(1);
      const cancelled = runner.cancel(taskId);
      expect(cancelled).toBe(true);
      expect(runner.getActiveCount()).toBe(0);
      expect(executed).toBe(false);
    });

    it('should return false when cancelling non-existent task', () => {
      runner = createFollowupRunner({});
      expect(runner.cancel('nonexistent')).toBe(false);
    });

    it('should cancel all tasks for a session', () => {
      runner = createFollowupRunner({
        defaultDelayMs: 1000,
        runTask: async () => ({ text: '' }),
      });

      runner.schedule({ id: 'a', sessionKey: 's1', prompt: '', delayMs: 1000 });
      runner.schedule({ id: 'b', sessionKey: 's1', prompt: '', delayMs: 1000 });
      runner.schedule({ id: 'c', sessionKey: 's2', prompt: '', delayMs: 1000 });

      expect(runner.getActiveCount('s1')).toBe(2);
      expect(runner.getActiveCount('s2')).toBe(1);

      runner.cancelAll('s1');
      expect(runner.getActiveCount('s1')).toBe(0);
      expect(runner.getActiveCount('s2')).toBe(1);
    });

    it('should respect maxConcurrent limit', () => {
      runner = createFollowupRunner({
        maxConcurrent: 2,
        defaultDelayMs: 1000,
        runTask: async () => ({ text: '' }),
      });

      runner.schedule({ id: '1', sessionKey: 's', prompt: '', delayMs: 1000 });
      runner.schedule({ id: '2', sessionKey: 's', prompt: '', delayMs: 1000 });
      runner.schedule({ id: '3', sessionKey: 's', prompt: '', delayMs: 1000 });

      expect(runner.getActiveCount()).toBe(2);
      expect(runner.getPendingCount()).toBe(1);
    });

    it('should generate id when not provided', () => {
      runner = createFollowupRunner({
        defaultDelayMs: 1000,
        runTask: async () => ({ text: '' }),
      });

      const taskId = runner.schedule({
        sessionKey: 's',
        prompt: 'test',
        delayMs: 1000,
      } as FollowupTask);

      expect(taskId).toBeTruthy();
      expect(typeof taskId).toBe('string');
    });

    it('should dispose and clear all tasks', () => {
      runner = createFollowupRunner({
        defaultDelayMs: 1000,
        runTask: async () => ({ text: '' }),
      });

      runner.schedule({ id: '1', sessionKey: 's', prompt: '', delayMs: 1000 });
      runner.schedule({ id: '2', sessionKey: 's', prompt: '', delayMs: 1000 });

      runner.dispose();
      expect(runner.getActiveCount()).toBe(0);
      expect(runner.getPendingCount()).toBe(0);
    });
  });

  describe('createFollowupRunner', () => {
    it('should create a FollowupRunner instance', () => {
      const r = createFollowupRunner({});
      expect(r).toBeInstanceOf(FollowupRunner);
      r.dispose();
    });

    it('should accept custom runTask function', async () => {
      const runTask = vi.fn(async () => ({ text: 'custom' }));
      const r = createFollowupRunner({
        defaultDelayMs: 50,
        runTask,
      });

      r.schedule({
        id: 'custom-test',
        sessionKey: 's',
        prompt: 'test',
        delayMs: 50,
      });

      await vi.advanceTimersByTimeAsync(100);
      expect(runTask).toHaveBeenCalled();
      r.dispose();
    });
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  fireAndForgetHook,
  fireAndForgetBoundedHook,
  formatHookErrorForLog,
  getFireAndForgetQueueSize,
  getFireAndForgetActiveCount,
  resetFireAndForgetStateForTest,
} from '../fire-and-forget.js';

describe('fire-and-forget', () => {
  beforeEach(() => {
    resetFireAndForgetStateForTest();
  });

  describe('formatHookErrorForLog', () => {
    it('should format error messages safely', () => {
      const err = new Error('test error');
      const result = formatHookErrorForLog(err);
      expect(result).toContain('test error');
    });

    it('should redact API keys and secrets', () => {
      const err = new Error('API key sk-abc123def456ghi789jkl012mno345pqr678 failed');
      const result = formatHookErrorForLog(err);
      expect(result).not.toContain('sk-abc123');
      expect(result).toContain('sk-***');
    });

    it('should redact Bearer tokens', () => {
      const err = new Error('Authorization: Bearer abc.def.ghi.jkl');
      const result = formatHookErrorForLog(err);
      expect(result).toContain('Bearer ***');
      expect(result).not.toContain('abc.def.ghi.jkl');
    });

    it('should redact passwords', () => {
      const err = new Error('password="mysecret123"');
      const result = formatHookErrorForLog(err);
      expect(result).toContain('password=***');
      expect(result).not.toContain('mysecret123');
    });

    it('should replace control characters with spaces', () => {
      const err = new Error('line1\nline2\tline3');
      const result = formatHookErrorForLog(err);
      expect(result).not.toContain('\n');
      expect(result).not.toContain('\t');
    });

    it('should truncate long messages', () => {
      const longMessage = 'a'.repeat(1000);
      const err = new Error(longMessage);
      const result = formatHookErrorForLog(err);
      expect(result.length).toBeLessThanOrEqual(500);
    });

    it('should handle non-Error inputs', () => {
      const result = formatHookErrorForLog('string error');
      expect(result).toContain('string error');
    });
  });

  describe('fireAndForgetHook', () => {
    it('should not log for resolved promises', async () => {
      const logger = vi.fn();
      fireAndForgetHook(Promise.resolve('ok'), 'test', logger);
      await Promise.resolve();
      expect(logger).not.toHaveBeenCalled();
    });

    it('should log rejection errors', async () => {
      const logger = vi.fn();
      fireAndForgetHook(Promise.reject(new Error('boom')), 'test-label', logger);
      await Promise.resolve();
      expect(logger).toHaveBeenCalled();
      const logMsg = logger.mock.calls[0][0];
      expect(logMsg).toContain('test-label');
      expect(logMsg).toContain('boom');
    });
  });

  describe('fireAndForgetBoundedHook', () => {
    it('should execute tasks when under concurrency limit', async () => {
      let executed = false;
      const task = async () => {
        executed = true;
      };

      fireAndForgetBoundedHook(task, 'test', () => {}, { maxConcurrency: 1, maxQueue: 1 });
      await Promise.resolve();
      expect(executed).toBe(true);
    });

    it('should queue tasks when at concurrency limit', async () => {
      let resolveFirst: (() => void) | undefined;
      const first = new Promise<void>((resolve) => {
        resolveFirst = resolve;
      });
      const starts: string[] = [];

      fireAndForgetBoundedHook(
        async () => {
          starts.push('first');
          await first;
        },
        'hook1',
        () => {},
        { maxConcurrency: 1, maxQueue: 2 },
      );
      fireAndForgetBoundedHook(
        async () => {
          starts.push('second');
        },
        'hook2',
        () => {},
        { maxConcurrency: 1, maxQueue: 2 },
      );

      await new Promise((r) => setTimeout(r, 10));
      expect(starts).toEqual(['first']);
      expect(getFireAndForgetQueueSize()).toBe(1);

      resolveFirst?.();
      await new Promise((r) => setTimeout(r, 10));
      expect(starts).toEqual(['first', 'second']);
    });

    it('should drop tasks when queue is full', async () => {
      let resolveFirst: (() => void) | undefined;
      const first = new Promise<void>((resolve) => {
        resolveFirst = resolve;
      });
      const logger = vi.fn();
      const starts: string[] = [];

      fireAndForgetBoundedHook(
        async () => {
          starts.push('first');
          await first;
        },
        'hook1',
        logger,
        { maxConcurrency: 1, maxQueue: 1 },
      );
      fireAndForgetBoundedHook(
        async () => {
          starts.push('second');
        },
        'hook2',
        logger,
        { maxConcurrency: 1, maxQueue: 1 },
      );
      fireAndForgetBoundedHook(
        async () => {
          starts.push('third');
        },
        'hook3',
        logger,
        { maxConcurrency: 1, maxQueue: 1 },
      );

      await new Promise((r) => setTimeout(r, 10));
      expect(logger).toHaveBeenCalledWith('hook3: queue full; dropping hook');
      expect(starts).toEqual(['first']);

      resolveFirst?.();
    });

    it('should log timeout for long-running tasks', async () => {
      vi.useFakeTimers();
      try {
        const logger = vi.fn();
        fireAndForgetBoundedHook(
          async () => new Promise(() => {}),
          'long-task',
          logger,
          { timeoutMs: 1000, maxConcurrency: 1, maxQueue: 1 },
        );

        await vi.advanceTimersByTimeAsync(1000);
        expect(logger).toHaveBeenCalledWith('long-task: timed out after 1000ms');
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('getFireAndForgetQueueSize and getFireAndForgetActiveCount', () => {
    it('should return correct counts', () => {
      expect(getFireAndForgetQueueSize()).toBe(0);
      expect(getFireAndForgetActiveCount()).toBe(0);
    });
  });
});

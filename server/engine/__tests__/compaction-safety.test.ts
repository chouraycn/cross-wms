// @vitest-environment node

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_COMPACTION_TIMEOUT_MS,
  DEFAULT_RETRY_CONFIG,
  compactWithSafetyTimeout,
  retryAsync,
  calculateBackoffDelay,
  isAbortError,
  isTimeoutError,
  createAbortError,
  composeAbortSignals,
  safeCompact,
  PartialSummaryError,
  type RetryConfig,
} from '../compaction-safety.js';

describe('compaction-safety', () => {
  describe('常量', () => {
    it('默认超时应该是 3 分钟', () => {
      expect(DEFAULT_COMPACTION_TIMEOUT_MS).toBe(180000);
    });

    it('默认重试配置应该合理', () => {
      expect(DEFAULT_RETRY_CONFIG.attempts).toBe(3);
      expect(DEFAULT_RETRY_CONFIG.minDelayMs).toBe(500);
      expect(DEFAULT_RETRY_CONFIG.maxDelayMs).toBe(5000);
      expect(DEFAULT_RETRY_CONFIG.jitter).toBeGreaterThanOrEqual(0);
      expect(DEFAULT_RETRY_CONFIG.jitter).toBeLessThanOrEqual(1);
    });
  });

  describe('isAbortError', () => {
    it('应该识别 AbortError', () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      expect(isAbortError(err)).toBe(true);
    });

    it('应该识别 DOMException AbortError', () => {
      const err = new DOMException('aborted', 'AbortError');
      expect(isAbortError(err)).toBe(true);
    });

    it('普通错误不应该是 AbortError', () => {
      expect(isAbortError(new Error('普通错误'))).toBe(false);
    });
  });

  describe('isTimeoutError', () => {
    it('应该识别超时错误', () => {
      const err = new Error('Request timed out');
      err.name = 'TimeoutError';
      expect(isTimeoutError(err)).toBe(true);
    });

    it('应该识别包含 timeout 的消息', () => {
      expect(isTimeoutError(new Error('The operation timed out'))).toBe(true);
    });

    it('普通错误不应该是超时错误', () => {
      expect(isTimeoutError(new Error('普通错误'))).toBe(false);
    });
  });

  describe('createAbortError', () => {
    it('应该创建 AbortError', () => {
      const err = createAbortError();
      expect(err.name).toBe('AbortError');
      expect(err.message).toContain('aborted');
    });

    it('应该包含原因', () => {
      const cause = new Error('cause');
      const err = createAbortError(cause);
      expect(err.cause).toBe(cause);
    });
  });

  describe('composeAbortSignals', () => {
    it('没有信号应该返回 undefined', () => {
      const { signal, cleanup } = composeAbortSignals();
      expect(signal).toBeUndefined();
      cleanup();
    });

    it('单个信号应该直接返回', () => {
      const controller = new AbortController();
      const { signal, cleanup } = composeAbortSignals(controller.signal);
      expect(signal).toBe(controller.signal);
      cleanup();
    });

    it('多个信号应该组合', () => {
      const controller1 = new AbortController();
      const controller2 = new AbortController();
      const { signal, cleanup } = composeAbortSignals(controller1.signal, controller2.signal);
      expect(signal).toBeDefined();
      expect(signal?.aborted).toBe(false);
      cleanup();
    });

    it('任一信号中止应该导致组合信号中止', () => {
      return new Promise<void>(resolve => {
        const controller1 = new AbortController();
        const controller2 = new AbortController();
        const { signal, cleanup } = composeAbortSignals(controller1.signal, controller2.signal);

        signal!.addEventListener('abort', () => {
          expect(signal!.aborted).toBe(true);
          cleanup();
          resolve();
        });

        controller1.abort();
      });
    });

    it('已中止的信号应该立即中止组合信号', () => {
      const controller = new AbortController();
      controller.abort();
      const { signal, cleanup } = composeAbortSignals(controller.signal);
      expect(signal?.aborted).toBe(true);
      cleanup();
    });
  });

  describe('calculateBackoffDelay', () => {
    it('应该随尝试次数增加', () => {
      const config: RetryConfig = {
        attempts: 5,
        minDelayMs: 100,
        maxDelayMs: 10000,
        jitter: 0,
      };
      const delay0 = calculateBackoffDelay(0, config);
      const delay1 = calculateBackoffDelay(1, config);
      const delay2 = calculateBackoffDelay(2, config);
      expect(delay1).toBeGreaterThan(delay0);
      expect(delay2).toBeGreaterThan(delay1);
    });

    it('不应该超过最大延迟', () => {
      const config: RetryConfig = {
        attempts: 10,
        minDelayMs: 100,
        maxDelayMs: 500,
        jitter: 0,
      };
      const delay = calculateBackoffDelay(10, config);
      expect(delay).toBeLessThanOrEqual(500);
    });

    it('应该包含抖动', () => {
      const config: RetryConfig = {
        attempts: 3,
        minDelayMs: 1000,
        maxDelayMs: 5000,
        jitter: 0.1,
      };
      // 多次调用应该有不同结果（概率上）
      const delays = new Set<number>();
      for (let i = 0; i < 20; i++) {
        delays.add(calculateBackoffDelay(2, config));
      }
      expect(delays.size).toBeGreaterThan(1);
    });
  });

  describe('retryAsync', () => {
    it('成功的函数不应该重试', async () => {
      let callCount = 0;
      const fn = async () => {
        callCount++;
        return 'success';
      };

      const result = await retryAsync(fn, { attempts: 3 }, 'test');
      expect(result).toBe('success');
      expect(callCount).toBe(1);
    });

    it('应该重试失败的函数', async () => {
      let callCount = 0;
      const fn = async () => {
        callCount++;
        throw new Error('fail');
      };

      await expect(retryAsync(fn, { attempts: 3, minDelayMs: 1, maxDelayMs: 10 }, 'test')).rejects.toThrow();
      expect(callCount).toBe(3);
    });

    it('AbortError 应该立即传播', async () => {
      let callCount = 0;
      const fn = async () => {
        callCount++;
        const err = new Error('aborted');
        err.name = 'AbortError';
        throw err;
      };

      await expect(retryAsync(fn, { attempts: 3, minDelayMs: 1 }, 'test')).rejects.toThrow();
      expect(callCount).toBe(1);
    });

    it('TimeoutError 应该立即传播', async () => {
      let callCount = 0;
      const fn = async () => {
        callCount++;
        const err = new Error('timeout');
        err.name = 'TimeoutError';
        throw err;
      };

      await expect(retryAsync(fn, { attempts: 3, minDelayMs: 1 }, 'test')).rejects.toThrow();
      expect(callCount).toBe(1);
    });
  });

  describe('compactWithSafetyTimeout', () => {
    it('快速完成的函数不应该超时', async () => {
      const result = await compactWithSafetyTimeout(
        async () => 'done',
        1000,
      );
      expect(result).toBe('done');
    });

    it('应该传递 AbortSignal', async () => {
      let receivedSignal: AbortSignal | undefined;
      await compactWithSafetyTimeout(
        async (signal) => {
          receivedSignal = signal;
          return 'done';
        },
        1000,
      );
      expect(receivedSignal).toBeDefined();
    });

    it('外部 AbortSignal 应该组合', async () => {
      const controller = new AbortController();

      const promise = compactWithSafetyTimeout(
        async () => {
          return new Promise<string>(() => {});
        },
        5000,
        { abortSignal: controller.signal },
      );

      setTimeout(() => controller.abort(), 10);

      await expect(promise).rejects.toThrow();
    });
  });

  describe('PartialSummaryError', () => {
    it('应该包含部分摘要', () => {
      const err = new PartialSummaryError('Partial', 'partial summary text');
      expect(err.name).toBe('PartialSummaryError');
      expect(err.partialSummary).toBe('partial summary text');
      expect(err.message).toBe('Partial');
    });
  });

  describe('safeCompact', () => {
    it('应该成功执行', async () => {
      const result = await safeCompact(
        async () => 'success',
        { timeoutMs: 1000, retry: { attempts: 2, minDelayMs: 1, maxDelayMs: 10 } },
      );
      expect(result).toBe('success');
    });
  });
});

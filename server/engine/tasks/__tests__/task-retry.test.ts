import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RETRY_POLICY,
  computeDelay,
  shouldRetry,
  canRetryTask,
  fixedRetry,
  exponentialRetry,
  retryOnErrors,
  noRetry,
} from '../task-retry.js';
import type { Task } from '../types.js';

function makeTask(retryCount: number, maxRetries: number): Task {
  return {
    id: 't', name: 't', status: 'failed', priority: 'medium', dependencies: [],
    timeoutMs: 0, maxRetries, retryCount, tags: [], metadata: {},
    createdAt: new Date().toISOString(), queuedAt: null, startedAt: null,
    completedAt: null, progress: null, result: null, error: null,
  };
}

describe('task-retry', () => {
  it('computeDelay fixed 策略恒定', () => {
    const p = { ...fixedRetry(3, 200), jitter: 0 };
    expect(computeDelay(p, 1)).toBe(200);
    expect(computeDelay(p, 5)).toBe(200);
  });

  it('computeDelay exponential 翻倍并受 maxDelayMs 限制', () => {
    const p = { ...exponentialRetry(3, 100, 1000), jitter: 0 };
    expect(computeDelay(p, 1)).toBe(100);
    expect(computeDelay(p, 2)).toBe(200);
    expect(computeDelay(p, 3)).toBe(400);
    expect(computeDelay(p, 10)).toBe(1000); // 上限
  });

  it('computeDelay linear 线性增长', () => {
    const p = { ...DEFAULT_RETRY_POLICY, strategy: 'linear' as const, baseDelayMs: 50, jitter: 0 };
    expect(computeDelay(p, 1)).toBe(50);
    expect(computeDelay(p, 3)).toBe(150);
  });

  it('shouldRetry 超过 maxRetries 返回 false', () => {
    const p = fixedRetry(2, 100);
    expect(shouldRetry(p, new Error('x'), 2)).toBe(true);
    expect(shouldRetry(p, new Error('x'), 3)).toBe(false);
  });

  it('shouldRetry 谓词不通过返回 false', () => {
    const p = retryOnErrors(['RetryableError']);
    expect(shouldRetry(p, new Error('x'), 1)).toBe(false); // name 不匹配
    const err = new Error('x');
    err.name = 'RetryableError';
    expect(shouldRetry(p, err, 1)).toBe(true);
  });

  it('canRetryTask 根据 retryCount/maxRetries', () => {
    expect(canRetryTask(makeTask(1, 3))).toBe(true);
    expect(canRetryTask(makeTask(3, 3))).toBe(false);
  });

  it('noRetry 策略 maxRetries=0', () => {
    expect(noRetry().maxRetries).toBe(0);
    expect(shouldRetry(noRetry(), new Error('x'), 1)).toBe(false);
  });

  it('jitter > 0 时延迟在合理范围内', () => {
    const p = { ...fixedRetry(1, 1000), jitter: 0.2 };
    for (let i = 0; i < 20; i++) {
      const d = computeDelay(p, 1);
      expect(d).toBeGreaterThanOrEqual(800);
      expect(d).toBeLessThanOrEqual(1200);
    }
  });
});

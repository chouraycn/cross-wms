/**
 * retry-handler 测试 — 429 / 5xx / 超时重试与退避。
 */
import { describe, it, expect } from 'vitest';
import {
  computeBackoffDelay,
  shouldRetry,
  sleep,
  withRetry,
  extractRetryAfter,
  makeAlwaysFailFn,
  makeSucceedAfterNFn,
  DEFAULT_RETRY_CONFIG,
} from '../retry-handler.js';
import { LLMError } from '../error-mapper.js';

describe('computeBackoffDelay', () => {
  it('指数退避递增', () => {
    const config = { ...DEFAULT_RETRY_CONFIG, jitterRatio: 0 };
    const d0 = computeBackoffDelay(0, config);
    const d1 = computeBackoffDelay(1, config);
    const d2 = computeBackoffDelay(2, config);
    expect(d1).toBeGreaterThan(d0);
    expect(d2).toBeGreaterThan(d1);
  });

  it('不超过 maxDelayMs', () => {
    const config = { ...DEFAULT_RETRY_CONFIG, maxDelayMs: 5000, jitterRatio: 0 };
    const d = computeBackoffDelay(20, config);
    expect(d).toBeLessThanOrEqual(5000);
  });

  it('jitterRatio=0 时无抖动', () => {
    const config = { ...DEFAULT_RETRY_CONFIG, jitterRatio: 0, initialDelayMs: 1000, backoffMultiplier: 2 };
    expect(computeBackoffDelay(0, config)).toBe(1000);
    expect(computeBackoffDelay(1, config)).toBe(2000);
  });
});

describe('shouldRetry', () => {
  it('达到 maxRetries 后不再重试', () => {
    const error = new Error('server error');
    (error as Error & { statusCode: number }).statusCode = 500;
    const decision = shouldRetry(error, 3, { ...DEFAULT_RETRY_CONFIG, maxRetries: 3 });
    expect(decision.shouldRetry).toBe(false);
  });

  it('非可重试错误（401）不重试', () => {
    const error = new Error('auth');
    (error as Error & { statusCode: number }).statusCode = 401;
    const decision = shouldRetry(error, 0, DEFAULT_RETRY_CONFIG);
    expect(decision.shouldRetry).toBe(false);
  });

  it('可重试错误（429）返回重试决策', () => {
    const error = new Error('rate limit');
    (error as Error & { statusCode: number }).statusCode = 429;
    const decision = shouldRetry(error, 0, DEFAULT_RETRY_CONFIG);
    expect(decision.shouldRetry).toBe(true);
    if (decision.shouldRetry) {
      expect(decision.delayMs).toBeGreaterThan(0);
      expect(decision.attempt).toBe(1);
    }
  });

  it('Retry-After 头优先于指数退避', () => {
    const error = new Error('rate limit');
    (error as Error & { statusCode: number }).statusCode = 429;
    const decision = shouldRetry(error, 0, DEFAULT_RETRY_CONFIG, 5000);
    expect(decision.shouldRetry).toBe(true);
    if (decision.shouldRetry) {
      expect(decision.delayMs).toBe(5000);
    }
  });
});

describe('sleep', () => {
  it('等待指定毫秒后 resolve', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40);
    expect(elapsed).toBeLessThan(200);
  });
});

describe('withRetry', () => {
  it('首次成功不重试', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(calls).toBe(1);
  });

  it('重试到成功', async () => {
    const fn = makeSucceedAfterNFn(2, 'finally-ok', makeRetryableError());
    const result = await withRetry(fn, {
      ...DEFAULT_RETRY_CONFIG,
      maxRetries: 5,
      initialDelayMs: 1,
      jitterRatio: 0,
    });
    expect(result).toBe('finally-ok');
  });

  it('达到 maxRetries 后抛出', async () => {
    const fn = makeAlwaysFailFn(() => makeRetryableError());
    await expect(
      withRetry(fn, {
        ...DEFAULT_RETRY_CONFIG,
        maxRetries: 2,
        initialDelayMs: 1,
        jitterRatio: 0,
      }),
    ).rejects.toThrow();
  });

  it('非可重试错误立即抛出', async () => {
    const fn = makeAlwaysFailFn(() => makeNonRetryableError());
    let onRetryCalled = false;
    await expect(
      withRetry(fn, { ...DEFAULT_RETRY_CONFIG, initialDelayMs: 1 }, {
        onRetry: () => { onRetryCalled = true; },
      }),
    ).rejects.toThrow();
    expect(onRetryCalled).toBe(false);
  });

  it('onRetry 回调在每次重试时被调用', async () => {
    const fn = makeSucceedAfterNFn(2, 'ok', makeRetryableError());
    const attempts: number[] = [];
    await withRetry(fn, {
      ...DEFAULT_RETRY_CONFIG,
      maxRetries: 5,
      initialDelayMs: 1,
      jitterRatio: 0,
    }, {
      onRetry: (attempt) => attempts.push(attempt),
    });
    expect(attempts).toHaveLength(2);
  });
});

describe('extractRetryAfter', () => {
  it('从 retryAfterMs 字段提取', () => {
    expect(extractRetryAfter({ retryAfterMs: 5000 })).toBe(5000);
  });

  it('从 retryAfter 字段提取（秒）', () => {
    expect(extractRetryAfter({ retryAfter: 5 })).toBe(5000);
  });

  it('从 headers 提取数字（秒）', () => {
    const headers = new Headers({ 'retry-after': '10' });
    expect(extractRetryAfter({ headers })).toBe(10_000);
  });

  it('无 Retry-After 返回 undefined', () => {
    expect(extractRetryAfter(new Error('nope'))).toBeUndefined();
  });
});

function makeRetryableError(): LLMError {
  return new LLMError(
    { code: 'server_error', retryable: true, message: 'transient' },
    500,
  );
}

function makeNonRetryableError(): LLMError {
  return new LLMError(
    { code: 'auth', retryable: false, message: 'unauthorized' },
    401,
  );
}

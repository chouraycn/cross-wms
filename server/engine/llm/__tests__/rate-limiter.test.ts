/**
 * rate-limiter 测试 — TPM / RPM / 并发限制。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  RateLimiter,
  getRateLimiter,
  removeRateLimiter,
  clearRateLimiters,
  DEFAULT_PROVIDER_LIMITS,
} from '../rate-limiter.js';

describe('RateLimiter', () => {
  it('无限制时 canRequest 总是 true', () => {
    const limiter = new RateLimiter();
    expect(limiter.canRequest()).toBe(true);
  });

  it('RPM 限制：超过阈值后拒绝', () => {
    const limiter = new RateLimiter({ requestsPerMinute: 3 });
    expect(limiter.acquire()).toBe(true);
    expect(limiter.acquire()).toBe(true);
    expect(limiter.acquire()).toBe(true);
    expect(limiter.acquire()).toBe(false); // 第 4 次被拒
  });

  it('release 后 inFlight 减少', () => {
    const limiter = new RateLimiter({ maxConcurrent: 2 });
    expect(limiter.acquire()).toBe(true);
    expect(limiter.acquire()).toBe(true);
    expect(limiter.canRequest()).toBe(false); // 并发已满
    limiter.release();
    expect(limiter.canRequest()).toBe(true);
  });

  it('TPM 限制：token 累计超过阈值拒绝', () => {
    const limiter = new RateLimiter({ tokensPerMinute: 1000 });
    expect(limiter.canConsumeTokens(500)).toBe(true);
    limiter.acquire();
    limiter.release(500);
    // 已用 500，剩余 500
    expect(limiter.canConsumeTokens(400)).toBe(true); // 500 + 400 = 900 ≤ 1000
    expect(limiter.canConsumeTokens(600)).toBe(false); // 500 + 600 = 1100 > 1000
  });

  it('snapshot 返回当前状态', () => {
    const limiter = new RateLimiter({ requestsPerMinute: 10, maxConcurrent: 5, tokensPerMinute: 1000 });
    limiter.acquire();
    limiter.release(100);
    const snap = limiter.snapshot();
    expect(snap.rpmLimit).toBe(10);
    expect(snap.concurrentLimit).toBe(5);
    expect(snap.tokensInWindow).toBe(100);
    expect(snap.requestsInWindow).toBe(1);
  });

  it('updateConfig 动态更新配置', () => {
    const limiter = new RateLimiter({ requestsPerMinute: 100 });
    expect(limiter.canRequest()).toBe(true);
    limiter.updateConfig({ requestsPerMinute: 0 });
    expect(limiter.canRequest()).toBe(false);
  });

  it('reset 清空所有窗口', () => {
    const limiter = new RateLimiter({ requestsPerMinute: 10 });
    limiter.acquire();
    limiter.release(100);
    limiter.reset();
    const snap = limiter.snapshot();
    expect(snap.requestsInWindow).toBe(0);
    expect(snap.tokensInWindow).toBe(0);
    expect(snap.inFlight).toBe(0);
  });

  it('waitForAvailability 在限制放宽后返回 true', async () => {
    const limiter = new RateLimiter({ maxConcurrent: 1 });
    limiter.acquire();
    // 限制已满，但 waitForAvailability 设置较短超时
    const result = await limiter.waitForAvailability(150);
    // 应该超时返回 false（除非 release）
    expect(result).toBe(false);
    limiter.release();
    const result2 = await limiter.waitForAvailability(100);
    expect(result2).toBe(true);
  });
});

describe('getRateLimiter 注册表', () => {
  beforeEach(() => {
    clearRateLimiters();
  });

  it('同一 provider 返回同一实例', () => {
    const a = getRateLimiter('openai');
    const b = getRateLimiter('openai');
    expect(a).toBe(b);
  });

  it('传入 config 时更新现有实例', () => {
    const a = getRateLimiter('openai', { requestsPerMinute: 100 });
    const b = getRateLimiter('openai', { requestsPerMinute: 50 });
    expect(a).toBe(b);
    expect(a.snapshot().rpmLimit).toBe(50);
  });

  it('removeRateLimiter 移除实例', () => {
    const before = getRateLimiter('openai');
    removeRateLimiter('openai');
    const after = getRateLimiter('openai');
    expect(after).not.toBe(before); // 重新获取是新实例
  });
});

describe('DEFAULT_PROVIDER_LIMITS', () => {
  it('包含主要 Provider 的默认配置', () => {
    expect(DEFAULT_PROVIDER_LIMITS['openai']).toBeDefined();
    expect(DEFAULT_PROVIDER_LIMITS['anthropic']).toBeDefined();
    expect(DEFAULT_PROVIDER_LIMITS['openai']?.requestsPerMinute).toBeGreaterThan(0);
  });

  it('Ollama 默认无 RPM 限制（本地）', () => {
    expect(DEFAULT_PROVIDER_LIMITS['ollama']?.requestsPerMinute).toBe(Infinity);
  });

  it('ERNIE 默认 requestsPerMinute 为 60', () => {
    expect(DEFAULT_PROVIDER_LIMITS.ernie).toBeDefined();
    expect(DEFAULT_PROVIDER_LIMITS.ernie?.requestsPerMinute).toBe(60);
  });

  it('Spark 默认 requestsPerMinute 为 50', () => {
    expect(DEFAULT_PROVIDER_LIMITS.spark).toBeDefined();
    expect(DEFAULT_PROVIDER_LIMITS.spark?.requestsPerMinute).toBe(50);
  });

  it('Yi 默认 requestsPerMinute 为 60', () => {
    expect(DEFAULT_PROVIDER_LIMITS.yi).toBeDefined();
    expect(DEFAULT_PROVIDER_LIMITS.yi?.requestsPerMinute).toBe(60);
  });
});

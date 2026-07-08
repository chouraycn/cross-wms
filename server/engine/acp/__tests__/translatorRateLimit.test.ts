import { describe, it, expect, beforeEach } from "vitest";
import {
  RateLimiter,
  getRateLimiter,
  resetRateLimiter,
  withRateLimit,
  getRateLimitKeyFromRequest,
} from "../translatorRateLimit.js";

describe("Translator - Rate Limit", () => {
  describe("RateLimiter", () => {
    it("should allow first request", () => {
      const limiter = new RateLimiter({ maxRequests: 5, windowMs: 60000 });
      const result = limiter.check("key1");
      expect(result.allowed).toBe(true);
    });

    it("should deny when limit exceeded", () => {
      const limiter = new RateLimiter({ maxRequests: 2, windowMs: 60000 });
      limiter.checkAndConsume("key1");
      limiter.checkAndConsume("key1");
      const result = limiter.checkAndConsume("key1");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it("should isolate keys", () => {
      const limiter = new RateLimiter({ maxRequests: 2, windowMs: 60000 });
      limiter.checkAndConsume("key1");
      limiter.checkAndConsume("key1");
      const result = limiter.checkAndConsume("key2");
      expect(result.allowed).toBe(true);
    });

    it("should reset specific key", () => {
      const limiter = new RateLimiter({ maxRequests: 1, windowMs: 60000 });
      limiter.checkAndConsume("key1");
      limiter.reset("key1");
      const result = limiter.check("key1");
      expect(result.allowed).toBe(true);
    });

    it("should reset all keys", () => {
      const limiter = new RateLimiter({ maxRequests: 1, windowMs: 60000 });
      limiter.checkAndConsume("key1");
      limiter.checkAndConsume("key2");
      limiter.resetAll();
      expect(limiter.check("key1").allowed).toBe(true);
      expect(limiter.check("key2").allowed).toBe(true);
    });

    it("should consume tokens", () => {
      const limiter = new RateLimiter({ maxRequests: 10, windowMs: 60000 });
      const result = limiter.check("key1");
      expect(result.remaining).toBeGreaterThan(0);
      limiter.consume("key1");
      const after = limiter.check("key1");
      expect(after.remaining).toBe(result.remaining - 1);
    });

    it("should return stats for key", () => {
      const limiter = new RateLimiter({ maxRequests: 10, windowMs: 60000 });
      limiter.checkAndConsume("key1");
      const stats = limiter.getStats("key1");
      expect(stats).not.toBeNull();
      expect(stats?.requestCount).toBe(1);
    });

    it("should return null stats for unknown key", () => {
      const limiter = new RateLimiter();
      const stats = limiter.getStats("unknown");
      expect(stats).toBeNull();
    });
  });

  describe("Token bucket", () => {
    it("should refill tokens over time with no window limit", async () => {
      const limiter = new RateLimiter({
        maxRequests: 100,
        bucketCapacity: 5,
        refillRate: 100, // 100 tokens per second
        windowMs: 60000,
      });
      // Consume all tokens
      for (let i = 0; i < 5; i++) {
        limiter.checkAndConsume("key1");
      }
      // Wait a bit for refill (50ms * 100 = 5 tokens)
      await new Promise(r => setTimeout(r, 60));
      const result = limiter.check("key1");
      expect(result.allowed).toBe(true);
    });

    it("should refill via stats", () => {
      const limiter = new RateLimiter({
        maxRequests: 100,
        bucketCapacity: 10,
        refillRate: 100,
        windowMs: 60000,
      });
      const stats1 = limiter.getStats("key1");
      expect(stats1).toBeNull();

      limiter.checkAndConsume("key1");
      const stats2 = limiter.getStats("key1");
      expect(stats2?.requestCount).toBe(1);
    });
  });

  describe("getRateLimiter singleton", () => {
    beforeEach(() => {
      resetRateLimiter();
    });

    it("should return same instance", () => {
      const r1 = getRateLimiter();
      const r2 = getRateLimiter();
      expect(r1).toBe(r2);
    });

    it("should reset on resetRateLimiter", () => {
      const r1 = getRateLimiter();
      resetRateLimiter();
      const r2 = getRateLimiter();
      expect(r1).not.toBe(r2);
    });
  });

  describe("withRateLimit", () => {
    beforeEach(() => {
      resetRateLimiter();
    });

    it("should call function when within limit", () => {
      const fn = (a: number, b: number) => a + b;
      const wrapped = withRateLimit(fn);
      const result = wrapped(1, 2);
      expect(result).toBe(3);
    });

    it("should return error when rate limit exceeded", () => {
      const limiter = new RateLimiter({ maxRequests: 1, windowMs: 60000 });
      const fn = () => "ok";
      const wrapped = withRateLimit(fn, { limiter });
      wrapped(); // consume
      const result = wrapped();
      expect((result as any).error).toContain("Rate limit");
    });

    it("should use custom keyFn", () => {
      const limiter = new RateLimiter({ maxRequests: 1, windowMs: 60000 });
      const fn = (key: string) => `result-${key}`;
      const wrapped = withRateLimit(fn, {
        limiter,
        keyFn: (key: string) => `key:${key}`,
      });
      const r1 = wrapped("a");
      const r2 = wrapped("b");
      expect(r1).toBe("result-a");
      expect(r2).toBe("result-b");
    });
  });

  describe("getRateLimitKeyFromRequest", () => {
    it("should extract session id from request", () => {
      const key = getRateLimitKeyFromRequest({ sessionId: "sess-1" } as any);
      expect(key).toBe("session:sess-1");
    });
  });
});

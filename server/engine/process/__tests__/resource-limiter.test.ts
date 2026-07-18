import { describe, it, expect } from 'vitest';
import { ResourceLimiter } from '../resource-limiter.js';
import type { ResourceUsage } from '../types.js';

function makeUsage(overrides: Partial<ResourceUsage> = {}): ResourceUsage {
  return {
    pid: 1,
    timestamp: 0,
    cpuPercent: 0,
    memoryMb: 0,
    rssBytes: 0,
    ...overrides,
  };
}

describe('ResourceLimiter', () => {
  it('无限制时返回 ok', () => {
    const limiter = new ResourceLimiter();
    const result = limiter.check(makeUsage({ memoryMb: 100, cpuPercent: 50 }), 0, 0);
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('内存超出限制产生违规', () => {
    const limiter = new ResourceLimiter({ memoryMb: 100 });
    const result = limiter.check(makeUsage({ memoryMb: 200 }), 0, 0);
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].field).toBe('memory');
    expect(result.violations[0].reason).toBe('resource-limit');
  });

  it('CPU 超出限制产生违规', () => {
    const limiter = new ResourceLimiter({ cpuPercent: 50 });
    const result = limiter.check(makeUsage({ cpuPercent: 80 }), 0, 0);
    expect(result.ok).toBe(false);
    expect(result.violations[0].field).toBe('cpu');
  });

  it('handles 超出限制产生违规', () => {
    const limiter = new ResourceLimiter({ maxHandles: 100 });
    const result = limiter.check(makeUsage({ handles: 200 }), 0, 0);
    expect(result.ok).toBe(false);
    expect(result.violations[0].field).toBe('handles');
  });

  it('handles 未定义时不检查', () => {
    const limiter = new ResourceLimiter({ maxHandles: 100 });
    const result = limiter.check(makeUsage({ handles: undefined }), 0, 0);
    expect(result.ok).toBe(true);
  });

  it('运行时间超出限制产生违规', () => {
    const limiter = new ResourceLimiter({ maxTimeMs: 1000 });
    const result = limiter.check(makeUsage(), 0, 1500);
    expect(result.ok).toBe(false);
    expect(result.violations[0].field).toBe('time');
    expect(result.violations[0].actual).toBe(1500);
  });

  it('合并两个限制取更严格的', () => {
    const a = new ResourceLimiter({ memoryMb: 200, cpuPercent: 80 });
    const b = new ResourceLimiter({ memoryMb: 100 });
    const merged = a.merge(b);
    const r1 = merged.check(makeUsage({ memoryMb: 150, cpuPercent: 0 }), 0, 0);
    expect(r1.ok).toBe(false); // 因为 b 的内存限制更严格
    const r2 = merged.check(makeUsage({ memoryMb: 90, cpuPercent: 90 }), 0, 0);
    expect(r2.ok).toBe(false); // 因为 a 的 CPU 限制 80 仍存在，90 > 80 违规
    const r3 = merged.check(makeUsage({ memoryMb: 90, cpuPercent: 50 }), 0, 0);
    expect(r3.ok).toBe(true);
  });

  it('刚好等于限制时不算违规', () => {
    const limiter = new ResourceLimiter({ memoryMb: 100 });
    const result = limiter.check(makeUsage({ memoryMb: 100 }), 0, 0);
    expect(result.ok).toBe(true);
  });
});

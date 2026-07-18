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

import {
  runInSandbox,
  createSandboxedRequire,
  detectDangerousCode,
  getSandboxStats,
  resetSandboxStats,
  resetCircuitBreaker,
  DEFAULT_SANDBOX_LIMITS,
} from '../sandbox.js';

describe('plugins/sandbox', () => {
  beforeEach(() => {
    resetSandboxStats();
  });

  describe('runInSandbox', () => {
    it('成功执行异步函数并返回结果', async () => {
      const result = await runInSandbox('p1', async () => 42);
      expect(result.ok).toBe(true);
      expect(result.value).toBe(42);
      expect(result.timedOut).toBe(false);
    });

    it('超时后返回 timedOut=true', async () => {
      const result = await runInSandbox(
        'p1',
        async () => {
          await new Promise((r) => setTimeout(r, 200));
          return 'late';
        },
        { limits: { timeoutMs: 50 } },
      );
      expect(result.ok).toBe(false);
      expect(result.timedOut).toBe(true);
      expect(result.error).toContain('超时');
    });

    it('函数抛错时返回 ok=false', async () => {
      const result = await runInSandbox('p1', async () => {
        throw new Error('boom');
      });
      expect(result.ok).toBe(false);
      expect(result.error).toBe('boom');
    });

    it('调用次数超限后拒绝执行', async () => {
      await runInSandbox('p1', async () => 1, { limits: { maxInvocations: 1 } });
      const result = await runInSandbox('p1', async () => 2, { limits: { maxInvocations: 1 } });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('调用次数');
    });

    it('熔断触发后冷却期内直接拒绝', async () => {
      // 连续 3 次失败触发熔断（默认阈值 5，这里用 breaker.failureThreshold=3）
      for (let i = 0; i < 3; i++) {
        await runInSandbox(
          'p1',
          async () => {
            throw new Error('fail');
          },
          { breaker: { failureThreshold: 3, cooldownMs: 10_000 } },
        );
      }
      const result = await runInSandbox('p1', async () => 1, {
        breaker: { failureThreshold: 3, cooldownMs: 10_000 },
      });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('熔断');
    });

    it('getSandboxStats 返回累计统计', async () => {
      await runInSandbox('p1', async () => 1);
      await runInSandbox('p1', async () => 2);
      const stats = getSandboxStats('p1');
      expect(stats?.invocations).toBe(2);
      expect(stats?.errors).toBe(0);
    });
  });

  describe('createSandboxedRequire', () => {
    it('拒绝黑名单模块', () => {
      const r = createSandboxedRequire('p1', ['fs']);
      expect(() => r('fs')).toThrow(/被禁止的模块/);
    });

    it('拒绝未声明模块', () => {
      const r = createSandboxedRequire('p1', []);
      expect(() => r('unknown')).toThrow(/未声明模块/);
    });

    it('允许声明模块（返回 undefined 占位）', () => {
      const r = createSandboxedRequire('p1', ['util']);
      expect(r('util')).toBeUndefined();
    });
  });

  describe('detectDangerousCode', () => {
    it('检测 eval 调用', () => {
      expect(detectDangerousCode('const x = eval("1")')).toMatch(/eval/);
    });

    it('检测 new Function 调用', () => {
      expect(detectDangerousCode('const fn = new Function("return 1")')).toMatch(/Function/);
    });

    it('安全代码返回 null', () => {
      expect(detectDangerousCode('const x = 1 + 1')).toBeNull();
    });

    it('不误匹配 retrieval 等单词', () => {
      expect(detectDangerousCode('const r = retrieval()')).toBeNull();
    });
  });

  describe('DEFAULT_SANDBOX_LIMITS', () => {
    it('提供合理默认值', () => {
      expect(DEFAULT_SANDBOX_LIMITS.timeoutMs).toBeGreaterThan(0);
      expect(DEFAULT_SANDBOX_LIMITS.maxInvocations).toBeGreaterThan(0);
    });
  });

  describe('resetCircuitBreaker', () => {
    it('重置后允许再次执行', async () => {
      for (let i = 0; i < 3; i++) {
        await runInSandbox(
          'p1',
          async () => {
            throw new Error('fail');
          },
          { breaker: { failureThreshold: 3, cooldownMs: 10_000 } },
        );
      }
      resetCircuitBreaker('p1');
      const result = await runInSandbox('p1', async () => 1, {
        breaker: { failureThreshold: 3, cooldownMs: 10_000 },
      });
      expect(result.ok).toBe(true);
    });
  });
});

import { describe, it, expect } from 'vitest';
import {
  RestartPolicy,
  RestartPolicyRegistry,
  computeRestartDelay,
  DEFAULT_RESTART_POLICY,
} from '../restart-policy.js';
import type { TerminationReason } from '../types.js';

describe('RestartPolicy', () => {
  describe('computeRestartDelay', () => {
    it('never 模式返回 0', () => {
      expect(
        computeRestartDelay({ id: 'x', mode: 'never', maxAttempts: 0 }, 0, () => 0.5),
      ).toBe(0);
    });

    it('immediate 模式返回 0', () => {
      expect(
        computeRestartDelay({ id: 'x', mode: 'immediate', maxAttempts: 3 }, 0, () => 0.5),
      ).toBe(0);
    });

    it('fixed-delay 模式返回配置延迟', () => {
      expect(
        computeRestartDelay(
          { id: 'x', mode: 'fixed-delay', maxAttempts: 3, delayMs: 500 },
          0,
          () => 0.5,
        ),
      ).toBe(500);
    });

    it('exponential-backoff 计算指数退避', () => {
      const policy = {
        id: 'x',
        mode: 'exponential-backoff' as const,
        maxAttempts: 5,
        baseDelayMs: 100,
        maxDelayMs: 10_000,
        jitter: 0,
      };
      expect(computeRestartDelay(policy, 0, () => 0)).toBe(100);
      expect(computeRestartDelay(policy, 1, () => 0)).toBe(200);
      expect(computeRestartDelay(policy, 2, () => 0)).toBe(400);
      expect(computeRestartDelay(policy, 3, () => 0)).toBe(800);
    });

    it('exponential-backoff 受 maxDelayMs 上限约束', () => {
      const policy = {
        id: 'x',
        mode: 'exponential-backoff' as const,
        maxAttempts: 5,
        baseDelayMs: 100,
        maxDelayMs: 300,
        jitter: 0,
      };
      expect(computeRestartDelay(policy, 100, () => 0)).toBe(300);
    });

    it('jitter 在合理范围内', () => {
      const policy = {
        id: 'x',
        mode: 'exponential-backoff' as const,
        maxAttempts: 5,
        baseDelayMs: 100,
        maxDelayMs: 10_000,
        jitter: 0.5,
      };
      const delay = computeRestartDelay(policy, 2, () => 0.5);
      // 400 ± 50% × 400 = 200..600，且不会为负
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(800);
    });
  });

  describe('shouldRestart', () => {
    it('never 模式不重启', () => {
      const p = new RestartPolicy({ id: 'x', mode: 'never', maxAttempts: 3 });
      expect(p.shouldRestart('crash')).toBe(false);
    });

    it('maxAttempts=0 不重启', () => {
      const p = new RestartPolicy({ id: 'x', mode: 'immediate', maxAttempts: 0 });
      expect(p.shouldRestart('crash')).toBe(false);
    });

    it('noRestartReasons 中的原因不重启', () => {
      const p = new RestartPolicy({
        id: 'x',
        mode: 'immediate',
        maxAttempts: 3,
        noRestartReasons: ['manual-stop' as TerminationReason],
      });
      expect(p.shouldRestart('manual-stop')).toBe(false);
      expect(p.shouldRestart('crash')).toBe(true);
    });

    it('超过 maxAttempts 后停止', () => {
      const p = new RestartPolicy({
        id: 'x',
        mode: 'immediate',
        maxAttempts: 2,
      });
      expect(p.shouldRestart('crash')).toBe(true);
      p.recordRestart('crash');
      expect(p.shouldRestart('crash')).toBe(true);
      p.recordRestart('crash');
      expect(p.shouldRestart('crash')).toBe(false);
    });

    it('reset 后计数清零', () => {
      const p = new RestartPolicy({
        id: 'x',
        mode: 'immediate',
        maxAttempts: 1,
      });
      p.recordRestart('crash');
      expect(p.shouldRestart('crash')).toBe(false);
      p.reset();
      expect(p.shouldRestart('crash')).toBe(true);
    });

    it('windowMs 超出后重置计数', () => {
      let t = 0;
      const p = new RestartPolicy(
        {
          id: 'x',
          mode: 'immediate',
          maxAttempts: 1,
          windowMs: 100,
        },
        { now: () => t },
      );
      p.recordRestart('crash');
      expect(p.shouldRestart('crash')).toBe(false);
      t = 200;
      expect(p.shouldRestart('crash')).toBe(true);
    });
  });

  describe('RestartPolicyRegistry', () => {
    it('注册并按 id 查询', () => {
      const reg = new RestartPolicyRegistry();
      reg.register({ id: 'p1', mode: 'fixed-delay', maxAttempts: 3, delayMs: 100 });
      expect(reg.get('p1')?.mode).toBe('fixed-delay');
      expect(reg.get('nonexistent')).toBeUndefined();
    });

    it('resolve 未注册 id 返回默认', () => {
      const reg = new RestartPolicyRegistry();
      expect(reg.resolve('unknown').mode).toBe(DEFAULT_RESTART_POLICY.mode);
    });

    it('resolve 无 id 返回默认', () => {
      const reg = new RestartPolicyRegistry();
      expect(reg.resolve(undefined).mode).toBe(DEFAULT_RESTART_POLICY.mode);
    });

    it('clear 清空注册表', () => {
      const reg = new RestartPolicyRegistry();
      reg.register({ id: 'p1', mode: 'immediate', maxAttempts: 1 });
      reg.clear();
      expect(reg.get('p1')).toBeUndefined();
    });
  });
});

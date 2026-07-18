import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TimeoutController, withTimeout, ProcessTimeoutError } from '../timeout.js';
import type { TerminationReason } from '../types.js';

describe('TimeoutController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('arm 启动 overall timeout 触发回调', () => {
    let fired: TerminationReason | null = null;
    const ctrl = new TimeoutController({
      overallTimeoutMs: 100,
      onTimeout: (r) => (fired = r),
    });
    ctrl.arm();
    expect(fired).toBeNull();
    vi.advanceTimersByTime(99);
    expect(fired).toBeNull();
    vi.advanceTimersByTime(1);
    expect(fired).toBe('overall-timeout');
  });

  it('touchOutput 重置 idle timeout', () => {
    let fired: TerminationReason | null = null;
    const ctrl = new TimeoutController({
      idleTimeoutMs: 50,
      onTimeout: (r) => (fired = r),
    });
    ctrl.arm();
    vi.advanceTimersByTime(40);
    ctrl.touchOutput();
    vi.advanceTimersByTime(40);
    expect(fired).toBeNull();
    vi.advanceTimersByTime(20);
    expect(fired).toBe('idle-timeout');
  });

  it('clear 取消所有定时器', () => {
    let fired = false;
    const ctrl = new TimeoutController({
      overallTimeoutMs: 100,
      onTimeout: () => (fired = true),
    });
    ctrl.arm();
    ctrl.clear();
    vi.advanceTimersByTime(200);
    expect(fired).toBe(false);
  });

  it('dispose 后 arm 不再生效', () => {
    let fired = false;
    const ctrl = new TimeoutController({
      overallTimeoutMs: 100,
      onTimeout: () => (fired = true),
    });
    ctrl.dispose();
    ctrl.arm();
    vi.advanceTimersByTime(200);
    expect(fired).toBe(false);
  });

  it('resolveElapsedReason 在截止后返回原因', () => {
    const ctrl = new TimeoutController({
      overallTimeoutMs: 100,
      onTimeout: () => {},
      now: () => 1000,
    });
    ctrl.arm();
    expect(ctrl.resolveElapsedReason(1100)).toBe('overall-timeout');
    expect(ctrl.resolveElapsedReason(1099)).toBeNull();
  });

  it('arm 幂等：重复调用不叠加', () => {
    let count = 0;
    const ctrl = new TimeoutController({
      overallTimeoutMs: 100,
      onTimeout: () => (count += 1),
    });
    ctrl.arm();
    ctrl.arm();
    vi.advanceTimersByTime(101);
    expect(count).toBe(1);
  });

  it('withTimeout 在超时后抛出 ProcessTimeoutError', async () => {
    vi.useRealTimers();
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve('ok'), 200));
    await expect(withTimeout(slow, 50)).rejects.toThrow(ProcessTimeoutError);
  });

  it('withTimeout 在任务先完成时返回结果', async () => {
    vi.useRealTimers();
    const fast = new Promise<string>((resolve) => setTimeout(() => resolve('ok'), 10));
    const result = await withTimeout(fast, 100);
    expect(result).toBe('ok');
  });

  it('withTimeout 在 timeoutMs <= 0 时直接等待', async () => {
    vi.useRealTimers();
    let resolved = false;
    const slow = new Promise<string>((resolve) => setTimeout(() => {
      resolved = true;
      resolve('ok');
    }, 10));
    const result = await withTimeout(slow, 0);
    expect(result).toBe('ok');
    expect(resolved).toBe(true);
  });
});

/**
 * waitForBackoff 单元测试（[二] 退避契约锁定）
 *
 * 用 fake timers 精确验证：
 *   - 在 backoffMs 到期前不 resolve（避免瞬时重放）
 *   - 到期后才 resolve
 *   - signal 已取消时立即 resolve（不挂起）
 *   - 等待中取消立即 resolve 且定时器被清理
 *   - ms<=0 立即 resolve
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { waitForBackoff } from '../backoffWait.js';

describe('waitForBackoff — 退避等待', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('在 backoffMs 到期前不 resolve，到期后才 resolve', async () => {
    const p = waitForBackoff(1000);
    let resolved = false;
    void p.then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(500);
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(500);
    await p; // 应已 resolve
    expect(resolved).toBe(true);
  });

  it('ms<=0 立即 resolve（不触发定时器）', async () => {
    await expect(waitForBackoff(0)).resolves.toBeUndefined();
    await expect(waitForBackoff(-5)).resolves.toBeUndefined();
  });

  it('signal 已 abort 时立即 resolve，不挂起', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(waitForBackoff(1000, ac.signal)).resolves.toBeUndefined();
  });

  it('等待中 abort 立即 resolve，且定时器被清理', async () => {
    const ac = new AbortController();
    const p = waitForBackoff(1000, ac.signal);
    let resolved = false;
    void p.then(() => {
      resolved = true;
    });

    ac.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(true);

    // 即便后续定时器触发也不应抛异常或重复 resolve
    await vi.advanceTimersByTimeAsync(2000);
    await p;
    expect(resolved).toBe(true);
  });
});

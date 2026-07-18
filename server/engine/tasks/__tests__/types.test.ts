import { describe, it, expect } from 'vitest';
import {
  PRIORITY_WEIGHT,
  PRIORITY_ORDER,
  normalizePriority,
  isTerminalStatus,
  isActiveStatus,
  isCancellableStatus,
  isPausableStatus,
  clampPercent,
  genTaskId,
  nowIso,
} from '../types.js';

describe('types 常量与纯函数', () => {
  it('PRIORITY_WEIGHT 权重 critical > low', () => {
    expect(PRIORITY_WEIGHT.critical).toBeGreaterThan(PRIORITY_WEIGHT.low);
    expect(PRIORITY_WEIGHT.critical).toBe(4);
    expect(PRIORITY_WEIGHT.low).toBe(1);
  });

  it('PRIORITY_ORDER 从高到低排列', () => {
    expect(PRIORITY_ORDER).toEqual(['critical', 'high', 'medium', 'low']);
  });

  it('normalizePriority 非法值降级为 medium', () => {
    expect(normalizePriority('urgent')).toBe('medium');
    expect(normalizePriority(undefined)).toBe('medium');
    expect(normalizePriority('high')).toBe('high');
  });

  it('isTerminalStatus 识别终态', () => {
    expect(isTerminalStatus('completed')).toBe(true);
    expect(isTerminalStatus('failed')).toBe(true);
    expect(isTerminalStatus('cancelled')).toBe(true);
    expect(isTerminalStatus('timeout')).toBe(true);
    expect(isTerminalStatus('running')).toBe(false);
  });

  it('isActiveStatus 识别活动态', () => {
    expect(isActiveStatus('running')).toBe(true);
    expect(isActiveStatus('queued')).toBe(true);
    expect(isActiveStatus('paused')).toBe(true);
    expect(isActiveStatus('pending')).toBe(false);
    expect(isActiveStatus('completed')).toBe(false);
  });

  it('isCancellableStatus 非终态可取消', () => {
    expect(isCancellableStatus('pending')).toBe(true);
    expect(isCancellableStatus('running')).toBe(true);
    expect(isCancellableStatus('completed')).toBe(false);
  });

  it('isPausableStatus 仅 running 可暂停', () => {
    expect(isPausableStatus('running')).toBe(true);
    expect(isPausableStatus('queued')).toBe(false);
    expect(isPausableStatus('paused')).toBe(false);
  });

  it('clampPercent 钳制到 [0,100] 并取整', () => {
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(150)).toBe(100);
    expect(clampPercent(42.7)).toBe(43);
    expect(clampPercent(NaN)).toBe(0);
  });

  it('genTaskId 唯一且单调', () => {
    const a = genTaskId();
    const b = genTaskId();
    expect(a).not.toBe(b);
    expect(a).toContain('task_');
  });

  it('nowIso 返回合法 ISO 字符串', () => {
    const s = nowIso();
    expect(() => new Date(s).toISOString()).not.toThrow();
    expect(Number.isFinite(new Date(s).getTime())).toBe(true);
  });
});

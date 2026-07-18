import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProcessMonitor } from '../monitor.js';
import type { ResourceUsage } from '../types.js';

describe('ProcessMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('pid 必须 > 0', () => {
    expect(() => new ProcessMonitor(0)).toThrow();
    expect(() => new ProcessMonitor(-1)).toThrow();
    expect(() => new ProcessMonitor(NaN)).toThrow();
  });

  it('sample 返回 usage 并加入历史', async () => {
    const fake: ResourceUsage = {
      pid: 1234,
      timestamp: 0,
      cpuPercent: 5,
      memoryMb: 10,
      rssBytes: 10 * 1024 * 1024,
    };
    const m = new ProcessMonitor(1234, { sampler: () => fake });
    const usage = await m.sample();
    expect(usage).toEqual(fake);
    expect(m.getHistory()).toHaveLength(1);
  });

  it('getPid 返回构造时的 pid', () => {
    const m = new ProcessMonitor(42);
    expect(m.getPid()).toBe(42);
  });

  it('isRunning 在 start 后为 true', () => {
    const m = new ProcessMonitor(42, { sampler: () => makeUsage() });
    expect(m.isRunning()).toBe(false);
    m.start();
    expect(m.isRunning()).toBe(true);
    m.stop();
    expect(m.isRunning()).toBe(false);
  });

  it('history 受 maxSamples 限制', async () => {
    const m = new ProcessMonitor(42, {
      sampler: (pid) => ({ ...makeUsage(pid), cpuPercent: 1 }),
      maxSamples: 3,
    });
    await m.sample();
    await m.sample();
    await m.sample();
    await m.sample();
    expect(m.getHistory()).toHaveLength(3);
  });

  it('averageCpuPercent 计算平均', async () => {
    const m = new ProcessMonitor(42, { sampler: (pid) => ({ ...makeUsage(pid), cpuPercent: 10 }) });
    await m.sample();
    await m.sample();
    expect(m.averageCpuPercent()).toBe(10);
  });

  it('peakMemoryMb 计算峰值', async () => {
    const values = [10, 50, 30];
    let i = 0;
    const m = new ProcessMonitor(42, {
      sampler: (pid) => ({ ...makeUsage(pid), memoryMb: values[i++] }),
    });
    await m.sample();
    await m.sample();
    await m.sample();
    expect(m.peakMemoryMb()).toBe(50);
  });

  it('last 返回最近一次采样', async () => {
    const m = new ProcessMonitor(42, {
      sampler: (pid) => ({ ...makeUsage(pid), cpuPercent: 1 }),
    });
    expect(m.last()).toBeNull();
    await m.sample();
    expect(m.last()?.cpuPercent).toBe(1);
  });

  it('clearHistory 清空历史', async () => {
    const m = new ProcessMonitor(42, { sampler: (pid) => makeUsage(pid) });
    await m.sample();
    m.clearHistory();
    expect(m.getHistory()).toHaveLength(0);
  });

  it('sampler 抛异常时 lastError 不为 null', async () => {
    const m = new ProcessMonitor(42, {
      sampler: () => { throw new Error('boom'); },
    });
    const usage = await m.sample();
    expect(usage).toBeNull();
    expect(m.getLastError()).toBeInstanceOf(Error);
  });

  function makeUsage(pid = 42): ResourceUsage {
    return {
      pid,
      timestamp: 0,
      cpuPercent: 0,
      memoryMb: 0,
      rssBytes: 0,
    };
  }
});

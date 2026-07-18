import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProcessPool } from '../pool.js';
import type { ManagedProcess, ProcessConfig, ProcessExitInfo, SpawnAdapter, TerminationReason } from '../types.js';

function makeManagedProcess(id: string, name = 'p'): ManagedProcess {
  let stopped = false;
  const exitPromise = new Promise<ProcessExitInfo>((resolve) => {
    // 不主动 resolve；测试通过 stop() 后手动 resolve
  });
  let resolveExit: (e: ProcessExitInfo) => void = () => {};
  const realExitPromise = new Promise<ProcessExitInfo>((resolve) => {
    resolveExit = resolve;
  });
  return {
    id,
    pid: 1000 + Number(id.replace(/\D/g, '') || 0),
    name,
    state: 'running',
    startedAtMs: Date.now(),
    lastOutputAtMs: Date.now(),
    config: { name, command: 'echo' },
    wait: () => realExitPromise,
    stop: () => {
      stopped = true;
      resolveExit({
        reason: 'manual-stop',
        exitCode: 0,
        exitSignal: null,
        durationMs: 0,
        timedOut: false,
      });
    },
  };
}

function makeFactory(captured: ManagedProcess[]) {
  let counter = 0;
  return vi.fn(async (config: ProcessConfig): Promise<ManagedProcess> => {
    const p = makeManagedProcess(`p${counter++}`, config.name);
    captured.push(p);
    return p;
  });
}

describe('ProcessPool', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('prewarm 创建 minSize 个进程', async () => {
    const captured: ManagedProcess[] = [];
    const pool = new ProcessPool(
      { template: { name: 'test', command: 'echo' }, minSize: 2, maxSize: 5 },
      makeFactory(captured),
    );
    await pool.prewarm();
    expect(pool.size()).toBe(2);
    expect(captured).toHaveLength(2);
  });

  it('acquire 返回空闲进程', async () => {
    const captured: ManagedProcess[] = [];
    const pool = new ProcessPool(
      { template: { name: 'test', command: 'echo' }, minSize: 1, maxSize: 2 },
      makeFactory(captured),
    );
    await pool.prewarm();
    const result = await pool.acquire();
    expect(result.entry).toBeDefined();
    expect(pool.busyCount()).toBe(1);
    expect(pool.idleCount()).toBe(0);
    result.release();
    expect(pool.idleCount()).toBe(1);
  });

  it('acquire 在没有空闲时按需创建直到 maxSize', async () => {
    const captured: ManagedProcess[] = [];
    const pool = new ProcessPool(
      { template: { name: 'test', command: 'echo' }, minSize: 0, maxSize: 2 },
      makeFactory(captured),
    );
    const a = await pool.acquire();
    const b = await pool.acquire();
    expect(pool.size()).toBe(2);
    expect(pool.busyCount()).toBe(2);
    a.release();
    b.release();
  });

  it('release(recycle=false) 主动淘汰进程', async () => {
    const captured: ManagedProcess[] = [];
    const pool = new ProcessPool(
      { template: { name: 'test', command: 'echo' }, minSize: 0, maxSize: 2 },
      makeFactory(captured),
    );
    const r = await pool.acquire();
    expect(pool.size()).toBe(1);
    r.release(false);
    expect(pool.size()).toBe(0);
  });

  it('acquire 在 maxSize 满时等待并超时', async () => {
    const captured: ManagedProcess[] = [];
    const pool = new ProcessPool(
      {
        template: { name: 'test', command: 'echo' },
        minSize: 0,
        maxSize: 1,
        acquireTimeoutMs: 100,
      },
      makeFactory(captured),
    );
    const a = await pool.acquire();
    const acquirePromise = pool.acquire();
    // 同步挂载 catch 防止 unhandled rejection
    acquirePromise.catch(() => {});
    // 推进 fake timer 触发超时回调
    await vi.advanceTimersByTimeAsync(101);
    await expect(acquirePromise).rejects.toThrow('acquire timed out');
    a.release();
  });

  it('list 返回快照列表', async () => {
    const captured: ManagedProcess[] = [];
    const pool = new ProcessPool(
      { template: { name: 'test', command: 'echo' }, minSize: 2, maxSize: 5 },
      makeFactory(captured),
    );
    await pool.prewarm();
    const list = pool.list();
    expect(list).toHaveLength(2);
    expect(list[0].name).toBe('test');
  });

  it('recycleIdle 回收空闲时间过长的进程', async () => {
    const captured: ManagedProcess[] = [];
    const pool = new ProcessPool(
      {
        template: { name: 'test', command: 'echo' },
        minSize: 1,
        maxSize: 5,
        idleRecycleMs: 100,
      },
      makeFactory(captured),
    );
    await pool.prewarm();
    // acquire 两个（第二个会 spawn 新进程），再 release 使其空闲
    const r1 = await pool.acquire();
    const r2 = await pool.acquire();
    r1.release();
    r2.release();
    expect(pool.size()).toBe(2);
    // 时间未到
    vi.advanceTimersByTime(50);
    expect(pool.recycleIdle(Date.now())).toBe(0);
    // 时间到
    vi.advanceTimersByTime(100);
    const recycled = pool.recycleIdle(Date.now());
    expect(recycled).toBeGreaterThanOrEqual(1);
    expect(pool.size()).toBe(1);
  });

  it('drain 停止所有进程', async () => {
    const captured: ManagedProcess[] = [];
    const pool = new ProcessPool(
      { template: { name: 'test', command: 'echo' }, minSize: 3, maxSize: 5 },
      makeFactory(captured),
    );
    await pool.prewarm();
    expect(pool.size()).toBe(3);
    await pool.drain();
    expect(pool.size()).toBe(0);
  });

  it('acquire 在 disposed 后抛错', async () => {
    const captured: ManagedProcess[] = [];
    const pool = new ProcessPool(
      { template: { name: 'test', command: 'echo' }, minSize: 0, maxSize: 1 },
      makeFactory(captured),
    );
    await pool.drain();
    await expect(pool.acquire()).rejects.toThrow('disposed');
  });

  it('prewarm 在 disposed 后无操作', async () => {
    const captured: ManagedProcess[] = [];
    const pool = new ProcessPool(
      { template: { name: 'test', command: 'echo' }, minSize: 2, maxSize: 5 },
      makeFactory(captured),
    );
    await pool.drain();
    await pool.prewarm();
    expect(pool.size()).toBe(0);
  });
});

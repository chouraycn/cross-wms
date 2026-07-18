import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProcessSupervisor } from '../supervisor.js';
import type { SpawnAdapter } from '../types.js';

type StubAdapter = SpawnAdapter & {
  emitStdout: (chunk: string) => void;
  emitStderr: (chunk: string) => void;
  settle: (code: number | null, signal?: NodeJS.Signals | null) => void;
  killMock: ReturnType<typeof vi.fn>;
  disposeMock: ReturnType<typeof vi.fn>;
};

function createStubAdapter(opts: { pid?: number; onKill?: (sig: NodeJS.Signals | undefined, a: StubAdapter) => void } = {}): StubAdapter {
  const stdoutListeners: Array<(chunk: string) => void> = [];
  const stderrListeners: Array<(chunk: string) => void> = [];
  let resolveWait: ((value: { code: number | null; signal: NodeJS.Signals | null }) => void) | null = null;
  const waitPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    resolveWait = resolve;
  });
  const killMock = vi.fn();
  const disposeMock = vi.fn();
  const adapter: StubAdapter = {
    pid: opts.pid ?? 1234,
    stdin: { write: () => {}, end: () => {} },
    onStdout: (l) => stdoutListeners.push(l),
    onStderr: (l) => stderrListeners.push(l),
    wait: async () => waitPromise,
    kill: (signal) => {
      killMock(signal);
      opts.onKill?.(signal, adapter);
    },
    dispose: () => disposeMock(),
    emitStdout: (chunk) => stdoutListeners.forEach((l) => l(chunk)),
    emitStderr: (chunk) => stderrListeners.forEach((l) => l(chunk)),
    settle: (code, signal = null) => {
      resolveWait?.({ code, signal });
      resolveWait = null;
    },
    killMock,
    disposeMock,
  };
  return adapter;
}

const createSpawnAdapterMock = vi.hoisted(() => vi.fn());

vi.mock('../spawner.js', () => ({
  createSpawnAdapter: createSpawnAdapterMock,
  resolveMaxCapturedChars: (v?: number) => (typeof v === 'number' ? Math.max(256, Math.floor(v)) : 1024 * 1024),
  appendCapturedOutput: (cur: string, chunk: string) => cur + chunk,
  parseSpawnArgs: () => ({ command: 'x', args: [], env: {}, stdio: ['pipe', 'pipe', 'pipe'] as const }),
}));

describe('ProcessSupervisor', () => {
  beforeEach(() => {
    createSpawnAdapterMock.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('start 启动进程并返回句柄', async () => {
    const adapter = createStubAdapter();
    createSpawnAdapterMock.mockReturnValue(adapter);
    const supervisor = new ProcessSupervisor();
    const result = await supervisor.start({ name: 'test', command: 'echo', args: ['hello'] });
    expect(result.process.name).toBe('test');
    expect(result.process.pid).toBe(1234);
    expect(result.process.state).toBe('running');
  });

  it('start 重复 id 抛错', async () => {
    const adapter = createStubAdapter();
    createSpawnAdapterMock.mockReturnValue(adapter);
    const supervisor = new ProcessSupervisor();
    await supervisor.start({ name: 'test', command: 'echo' }, { id: 'p1' });
    await expect(supervisor.start({ name: 'test', command: 'echo' }, { id: 'p1' })).rejects.toThrow('already exists');
  });

  it('wait 返回 exit 信息', async () => {
    const adapter = createStubAdapter();
    createSpawnAdapterMock.mockReturnValue(adapter);
    const supervisor = new ProcessSupervisor();
    const { process } = await supervisor.start({ name: 'test', command: 'echo' });
    adapter.settle(0);
    const exit = await process.wait();
    expect(exit.exitCode).toBe(0);
    expect(exit.reason).toBe('exit');
  });

  it('stop 发送 SIGTERM', async () => {
    const adapter = createStubAdapter();
    createSpawnAdapterMock.mockReturnValue(adapter);
    const supervisor = new ProcessSupervisor();
    const { process } = await supervisor.start({ name: 'test', command: 'echo' });
    process.stop();
    expect(adapter.killMock).toHaveBeenCalledWith('SIGTERM');
  });

  it('stop 升级 SIGKILL（在 grace 超时后）', async () => {
    vi.useFakeTimers();
    const adapter = createStubAdapter({
      onKill: (signal, a) => {
        if (signal === 'SIGKILL') a.settle(null, 'SIGKILL');
      },
    });
    createSpawnAdapterMock.mockReturnValue(adapter);
    const supervisor = new ProcessSupervisor();
    const { process } = await supervisor.start({ name: 'test', command: 'echo' });
    process.stop();
    expect(adapter.killMock).toHaveBeenCalledWith('SIGTERM');
    await vi.advanceTimersByTimeAsync(5_001);
    expect(adapter.killMock).toHaveBeenCalledWith('SIGKILL');
  });

  it('timeout 触发 SIGTERM 并标记 overall-timeout', async () => {
    vi.useFakeTimers();
    const adapter = createStubAdapter({
      onKill: (signal, a) => {
        if (signal) a.settle(null, signal);
      },
    });
    createSpawnAdapterMock.mockReturnValue(adapter);
    const supervisor = new ProcessSupervisor();
    const { process } = await supervisor.start({
      name: 'test',
      command: 'sleep',
      args: ['1000'],
      timeoutMs: 100,
    });
    const waitPromise = process.wait();
    await vi.advanceTimersByTimeAsync(101);
    const exit = await waitPromise;
    expect(adapter.killMock).toHaveBeenCalledWith('SIGTERM');
    expect(exit.reason).toBe('overall-timeout');
    expect(exit.timedOut).toBe(true);
  });

  it('idle timeout 触发 SIGTERM', async () => {
    vi.useFakeTimers();
    const adapter = createStubAdapter({
      onKill: (signal, a) => {
        if (signal) a.settle(null, signal);
      },
    });
    createSpawnAdapterMock.mockReturnValue(adapter);
    const supervisor = new ProcessSupervisor();
    const { process } = await supervisor.start({
      name: 'test',
      command: 'sleep',
      args: ['1000'],
      idleTimeoutMs: 50,
    });
    const waitPromise = process.wait();
    await vi.advanceTimersByTimeAsync(51);
    const exit = await waitPromise;
    expect(exit.reason).toBe('idle-timeout');
  });

  it('touchOutput 重置 idle timer', async () => {
    vi.useFakeTimers();
    const adapter = createStubAdapter({
      onKill: (signal, a) => {
        if (signal) a.settle(null, signal);
      },
    });
    createSpawnAdapterMock.mockReturnValue(adapter);
    const supervisor = new ProcessSupervisor();
    const { process } = await supervisor.start({
      name: 'test',
      command: 'sleep',
      args: ['1000'],
      idleTimeoutMs: 50,
    });
    const waitPromise = process.wait();
    await vi.advanceTimersByTimeAsync(40);
    adapter.emitStdout('progress');
    await vi.advanceTimersByTimeAsync(40);
    // 应仍存活，因为 40ms 时输出活动重置了 idle timer
    await Promise.resolve();
    expect(adapter.killMock).not.toHaveBeenCalled();
    // 再到 51 时应触发
    await vi.advanceTimersByTimeAsync(51);
    const exit = await waitPromise;
    expect(exit.reason).toBe('idle-timeout');
  });

  it('list 返回当前进程快照', async () => {
    const adapter = createStubAdapter();
    createSpawnAdapterMock.mockReturnValue(adapter);
    const supervisor = new ProcessSupervisor();
    await supervisor.start({ name: 'a', command: 'echo' }, { id: 'p1' });
    await supervisor.start({ name: 'b', command: 'echo' }, { id: 'p2' });
    const list = supervisor.list();
    expect(list).toHaveLength(2);
    expect(list.map((s) => s.name).sort()).toEqual(['a', 'b']);
  });

  it('get 返回指定进程', async () => {
    const adapter = createStubAdapter();
    createSpawnAdapterMock.mockReturnValue(adapter);
    const supervisor = new ProcessSupervisor();
    await supervisor.start({ name: 'a', command: 'echo' }, { id: 'p1' });
    const p = supervisor.get('p1');
    expect(p?.name).toBe('a');
    expect(supervisor.get('nonexistent')).toBeUndefined();
  });

  it('cancelScope 停止同 name 的所有进程', async () => {
    const a1 = createStubAdapter();
    const a2 = createStubAdapter();
    createSpawnAdapterMock.mockReturnValueOnce(a1).mockReturnValueOnce(a2);
    const supervisor = new ProcessSupervisor();
    await supervisor.start({ name: 'shared', command: 'echo' }, { id: 'p1' });
    await supervisor.start({ name: 'shared', command: 'echo' }, { id: 'p2' });
    supervisor.cancelScope('shared');
    expect(a1.killMock).toHaveBeenCalledWith('SIGTERM');
    expect(a2.killMock).toHaveBeenCalledWith('SIGTERM');
  });

  it('restart 停止后重新启动', async () => {
    const adapter1 = createStubAdapter({
      onKill: (signal, a) => {
        if (signal) a.settle(null, signal);
      },
    });
    const adapter2 = createStubAdapter();
    createSpawnAdapterMock.mockReturnValueOnce(adapter1).mockReturnValueOnce(adapter2);
    const supervisor = new ProcessSupervisor();
    await supervisor.start({ name: 'a', command: 'echo' }, { id: 'p1' });
    // restart 内部会 stop（发送 SIGTERM，adapter1 settle），等待退出，再 start
    const result = await supervisor.restart('p1');
    expect(result.process).toBeDefined();
    expect(result.process.name).toBe('a');
  });

  it('非零退出码分类为 crash', async () => {
    const adapter = createStubAdapter();
    createSpawnAdapterMock.mockReturnValue(adapter);
    const supervisor = new ProcessSupervisor();
    const { process } = await supervisor.start({ name: 'a', command: 'echo' });
    adapter.settle(42);
    const exit = await process.wait();
    expect(exit.exitCode).toBe(42);
    expect(exit.reason).toBe('crash');
  });

  it('signal 终止分类为 signal', async () => {
    const adapter = createStubAdapter();
    createSpawnAdapterMock.mockReturnValue(adapter);
    const supervisor = new ProcessSupervisor();
    const { process } = await supervisor.start({ name: 'a', command: 'echo' });
    adapter.settle(null, 'SIGKILL');
    const exit = await process.wait();
    expect(exit.reason).toBe('signal');
  });

  it('exitResolve 在 settled 后不重复触发', async () => {
    const adapter = createStubAdapter();
    createSpawnAdapterMock.mockReturnValue(adapter);
    const supervisor = new ProcessSupervisor();
    const { process } = await supervisor.start({ name: 'a', command: 'echo' });
    adapter.settle(0);
    const exit = await process.wait();
    expect(exit.exitCode).toBe(0);
    // lifecycle 中应为 exited
    const record = supervisor.getLifecycle().get(process.id);
    expect(record?.state).toBe('exited');
  });
});

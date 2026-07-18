import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProcessManager } from '../manager.js';
import type { SpawnAdapter } from '../types.js';

const createSpawnAdapterMock = vi.hoisted(() => vi.fn());
vi.mock('../spawner.js', () => ({
  createSpawnAdapter: createSpawnAdapterMock,
  resolveMaxCapturedChars: (v?: number) => (typeof v === 'number' ? Math.max(256, Math.floor(v)) : 1024 * 1024),
  appendCapturedOutput: (cur: string, chunk: string) => cur + chunk,
  parseSpawnArgs: () => ({ command: 'x', args: [], env: {}, stdio: ['pipe', 'pipe', 'pipe'] as const }),
}));

function createStubAdapter(opts: { pid?: number; onKill?: (sig: NodeJS.Signals | undefined, a: ReturnType<typeof createStubAdapter>) => void } = {}) {
  const stdoutListeners: Array<(chunk: string) => void> = [];
  const stderrListeners: Array<(chunk: string) => void> = [];
  let resolveWait: ((value: { code: number | null; signal: NodeJS.Signals | null }) => void) | null = null;
  const waitPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    resolveWait = resolve;
  });
  const killMock = vi.fn();
  const disposeMock = vi.fn();
  const adapter = {
    pid: opts.pid ?? 1234,
    stdin: { write: () => {}, end: () => {} },
    onStdout: (l: (c: string) => void) => stdoutListeners.push(l),
    onStderr: (l: (c: string) => void) => stderrListeners.push(l),
    wait: async () => waitPromise,
    kill: (signal?: NodeJS.Signals) => {
      killMock(signal);
      opts.onKill?.(signal, adapter);
    },
    dispose: () => disposeMock(),
    emitStdout: (chunk: string) => stdoutListeners.forEach((l) => l(chunk)),
    emitStderr: (chunk: string) => stderrListeners.forEach((l) => l(chunk)),
    settle: (code: number | null, signal: NodeJS.Signals | null = null) => {
      resolveWait?.({ code, signal });
      resolveWait = null;
    },
    killMock,
    disposeMock,
  } as unknown as ReturnType<typeof createStubAdapter> & SpawnAdapter;
  return adapter;
}

describe('ProcessManager', () => {
  beforeEach(() => {
    createSpawnAdapterMock.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('start 启动并跟踪进程', async () => {
    const adapter = createStubAdapter();
    createSpawnAdapterMock.mockReturnValue(adapter);
    const mgr = new ProcessManager();
    const p = await mgr.start({ name: 'a', command: 'echo' });
    expect(p.name).toBe('a');
    expect(mgr.list()).toHaveLength(1);
  });

  it('get 获取指定进程', async () => {
    const adapter = createStubAdapter();
    createSpawnAdapterMock.mockReturnValue(adapter);
    const mgr = new ProcessManager();
    const p = await mgr.start({ name: 'a', command: 'echo' }, 'p1');
    expect(mgr.get('p1')?.name).toBe('a');
  });

  it('getByName 按 name 查找', async () => {
    const adapter = createStubAdapter();
    createSpawnAdapterMock.mockReturnValue(adapter);
    const mgr = new ProcessManager();
    await mgr.start({ name: 'worker', command: 'echo' }, 'p1');
    const found = mgr.getByName('worker');
    expect(found?.name).toBe('worker');
    expect(mgr.getByName('nonexistent')).toBeUndefined();
  });

  it('stop 停止指定进程', async () => {
    const adapter = createStubAdapter();
    createSpawnAdapterMock.mockReturnValue(adapter);
    const mgr = new ProcessManager();
    const p = await mgr.start({ name: 'a', command: 'echo' });
    mgr.stop(p.id);
    expect(adapter.killMock).toHaveBeenCalledWith('SIGTERM');
  });

  it('stopAll 停止所有进程', async () => {
    const a1 = createStubAdapter({ onKill: (sig, a) => a.settle(null, sig) });
    const a2 = createStubAdapter({ onKill: (sig, a) => a.settle(null, sig) });
    createSpawnAdapterMock.mockReturnValueOnce(a1).mockReturnValueOnce(a2);
    const mgr = new ProcessManager();
    await mgr.start({ name: 'a', command: 'echo' }, 'p1');
    await mgr.start({ name: 'b', command: 'echo' }, 'p2');
    await mgr.stopAll();
    expect(a1.killMock).toHaveBeenCalled();
    expect(a2.killMock).toHaveBeenCalled();
  });

  it('stopAllByName 停止同 name 进程', async () => {
    const a1 = createStubAdapter({ onKill: (sig, a) => a.settle(null, sig) });
    const a2 = createStubAdapter({ onKill: (sig, a) => a.settle(null, sig) });
    createSpawnAdapterMock.mockReturnValueOnce(a1).mockReturnValueOnce(a2);
    const mgr = new ProcessManager();
    await mgr.start({ name: 'worker', command: 'echo' }, 'p1');
    await mgr.start({ name: 'worker', command: 'echo' }, 'p2');
    await mgr.stopAllByName('worker');
    expect(a1.killMock).toHaveBeenCalled();
    expect(a2.killMock).toHaveBeenCalled();
  });

  it('getDefaultSupervisor 返回默认 supervisor', () => {
    const mgr = new ProcessManager();
    expect(mgr.getDefaultSupervisor()).toBeDefined();
  });

  it('getOrCreatePool 创建池并按 name 复用', async () => {
    const adapter = createStubAdapter();
    createSpawnAdapterMock.mockReturnValue(adapter);
    const mgr = new ProcessManager();
    const pool1 = mgr.getOrCreatePool('pool-a', {
      template: { name: 'worker', command: 'echo' },
      minSize: 1,
      maxSize: 3,
    });
    expect(pool1).toBeDefined();
    const pool2 = mgr.getOrCreatePool('pool-a', {
      template: { name: 'worker', command: 'echo' },
      minSize: 1,
      maxSize: 3,
    });
    expect(pool2).toBe(pool1);
  });

  it('getPool 返回 undefined 若不存在', () => {
    const mgr = new ProcessManager();
    expect(mgr.getPool('nonexistent')).toBeUndefined();
  });
});

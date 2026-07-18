import { describe, it, expect } from 'vitest';
import { ProcessCommunicator } from '../communicator.js';
import type { SpawnAdapter, IPCMessage } from '../types.js';

function createStubAdapter(): SpawnAdapter & {
  emitStdout: (chunk: string) => void;
  emitStderr: (chunk: string) => void;
  emitIPC: (msg: unknown) => void;
  killMock: ReturnType<typeof vi.fn>;
  writeMock: ReturnType<typeof vi.fn>;
  endMock: ReturnType<typeof vi.fn>;
} {
  const stdoutListeners: Array<(chunk: string) => void> = [];
  const stderrListeners: Array<(chunk: string) => void> = [];
  const ipcListeners: Array<(message: unknown) => void> = [];
  let resolveWait: ((value: { code: number | null; signal: NodeJS.Signals | null }) => void) | null = null;
  return {
    pid: 1234,
    stdin: {
      write: (data: string) => {},
      end: () => {},
    },
    onStdout: (l) => stdoutListeners.push(l),
    onStderr: (l) => stderrListeners.push(l),
    onIPCMessage: (l) => ipcListeners.push(l),
    wait: () => new Promise((resolve) => { resolveWait = resolve; }),
    kill: (signal) => {},
    dispose: () => {},
    emitStdout: (chunk) => stdoutListeners.forEach((l) => l(chunk)),
    emitStderr: (chunk) => stderrListeners.forEach((l) => l(chunk)),
    emitIPC: (msg) => ipcListeners.forEach((l) => l(msg)),
    killMock: vi.fn() as unknown as ReturnType<typeof vi.fn>,
    writeMock: vi.fn() as unknown as ReturnType<typeof vi.fn>,
    endMock: vi.fn() as unknown as ReturnType<typeof vi.fn>,
  } as ReturnType<typeof createStubAdapter>;
}

describe('ProcessCommunicator', () => {
  it('onStdout 监听器接收到 stdout 数据', () => {
    const adapter = createStubAdapter();
    const comms = new ProcessCommunicator(adapter);
    const received: string[] = [];
    comms.onStdout((chunk) => received.push(chunk));
    adapter.emitStdout('hello');
    expect(received).toEqual(['hello']);
  });

  it('onStderr 监听器接收到 stderr 数据', () => {
    const adapter = createStubAdapter();
    const comms = new ProcessCommunicator(adapter);
    const received: string[] = [];
    comms.onStderr((chunk) => received.push(chunk));
    adapter.emitStderr('error');
    expect(received).toEqual(['error']);
  });

  it('onStdout 返回取消订阅函数', () => {
    const adapter = createStubAdapter();
    const comms = new ProcessCommunicator(adapter);
    const received: string[] = [];
    const off = comms.onStdout((chunk) => received.push(chunk));
    off();
    adapter.emitStdout('hello');
    expect(received).toHaveLength(0);
  });

  it('writeStdin 调用 adapter.stdin.write', () => {
    const write = vi.fn();
    const adapter: SpawnAdapter = {
      pid: 1,
      stdin: { write, end: () => {} },
      onStdout: () => {},
      onStderr: () => {},
      wait: () => new Promise(() => {}),
      kill: () => {},
      dispose: () => {},
    };
    const comms = new ProcessCommunicator(adapter);
    comms.writeStdin('data');
    expect(write).toHaveBeenCalledWith('data');
  });

  it('closeStdin 调用 end 且只能调用一次', () => {
    const end = vi.fn();
    const adapter: SpawnAdapter = {
      pid: 1,
      stdin: { write: () => {}, end },
      onStdout: () => {},
      onStderr: () => {},
      wait: () => new Promise(() => {}),
      kill: () => {},
      dispose: () => {},
    };
    const comms = new ProcessCommunicator(adapter);
    comms.closeStdin();
    comms.closeStdin();
    expect(end).toHaveBeenCalledTimes(1);
    expect(comms.isStdinClosed()).toBe(true);
  });

  it('writeStdin 在 closeStdin 后被忽略', () => {
    const write = vi.fn();
    const adapter: SpawnAdapter = {
      pid: 1,
      stdin: { write, end: () => {} },
      onStdout: () => {},
      onStderr: () => {},
      wait: () => new Promise(() => {}),
      kill: () => {},
      dispose: () => {},
    };
    const comms = new ProcessCommunicator(adapter);
    comms.closeStdin();
    comms.writeStdin('data');
    expect(write).not.toHaveBeenCalled();
  });

  it('sendSignal 调用 adapter.kill', () => {
    const kill = vi.fn();
    const adapter: SpawnAdapter = {
      pid: 1,
      onStdout: () => {},
      onStderr: () => {},
      wait: () => new Promise(() => {}),
      kill,
      dispose: () => {},
    };
    const comms = new ProcessCommunicator(adapter);
    comms.sendSignal('SIGTERM');
    expect(kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('onIPCMessage 接收对象消息', () => {
    const adapter = createStubAdapter();
    const comms = new ProcessCommunicator(adapter);
    const received: IPCMessage[] = [];
    comms.onIPCMessage((msg) => received.push(msg));
    adapter.emitIPC({ type: 'ready', payload: 42 });
    expect(received).toEqual([{ type: 'ready', payload: 42 }]);
  });

  it('onIPCMessage 将字符串消息封装为 raw', () => {
    const adapter = createStubAdapter();
    const comms = new ProcessCommunicator(adapter);
    const received: IPCMessage[] = [];
    comms.onIPCMessage((msg) => received.push(msg));
    adapter.emitIPC('plain text');
    expect(received[0]).toEqual({ type: 'raw', payload: 'plain text' });
  });

  it('onIPCMessage 解析 JSON 字符串', () => {
    const adapter = createStubAdapter();
    const comms = new ProcessCommunicator(adapter);
    const received: IPCMessage[] = [];
    comms.onIPCMessage((msg) => received.push(msg));
    adapter.emitIPC(JSON.stringify({ type: 'ping' }));
    expect(received[0]).toEqual({ type: 'ping' });
  });

  it('构造时传入的 events 回调被调用', () => {
    const adapter = createStubAdapter();
    const stdout = vi.fn();
    const comms = new ProcessCommunicator(adapter, { onStdout: stdout });
    adapter.emitStdout('chunk');
    expect(stdout).toHaveBeenCalledWith('chunk');
  });
});

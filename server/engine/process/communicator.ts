/**
 * 进程通信器
 *
 * 封装 stdin 写入、stdout/stderr 监听、IPC 消息与信号发送。
 */

import { logger } from '../../logger.js';
import type { SpawnAdapter } from './types.js';

/** IPC 消息类型约束 */
export interface IPCMessage {
  type: string;
  payload?: unknown;
}

/** 通信器事件 */
export interface CommunicatorEvents {
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  onIPCMessage?: (message: IPCMessage) => void;
  onStdinError?: (err: Error) => void;
}

/**
 * 进程通信器
 *
 * 一个实例对应一个 SpawnAdapter；提供 stdin/stdout/stderr/IPC/信号 的统一 API。
 */
export class ProcessCommunicator {
  private readonly adapter: SpawnAdapter;
  private readonly events: CommunicatorEvents;
  private readonly stdoutListeners: Array<(chunk: string) => void> = [];
  private readonly stderrListeners: Array<(chunk: string) => void> = [];
  private readonly ipcListeners: Array<(message: IPCMessage) => void> = [];
  private stdinClosed = false;

  constructor(adapter: SpawnAdapter, events?: CommunicatorEvents) {
    this.adapter = adapter;
    this.events = events ?? {};
    this.adapter.onStdout((chunk) => this.handleStdout(chunk));
    this.adapter.onStderr((chunk) => this.handleStderr(chunk));
    this.adapter.onIPCMessage?.((message) => this.handleIPCMessage(message));
  }

  /** 写入 stdin */
  writeStdin(data: string): void {
    if (this.stdinClosed) {
      logger.debug('[Process:Communicator] writeStdin ignored: stdin closed');
      return;
    }
    if (!this.adapter.stdin) {
      logger.debug('[Process:Communicator] writeStdin ignored: no stdin');
      return;
    }
    try {
      this.adapter.stdin.write(data);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      this.events.onStdinError?.(e);
      throw e;
    }
  }

  /** 关闭 stdin（通常配合 input 写入完成） */
  closeStdin(): void {
    if (this.stdinClosed) {
      return;
    }
    this.stdinClosed = true;
    try {
      this.adapter.stdin?.end();
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      this.events.onStdinError?.(e);
    }
  }

  /** 发送信号 */
  sendSignal(signal: NodeJS.Signals): void {
    this.adapter.kill(signal);
  }

  /** 监听 stdout */
  onStdout(listener: (chunk: string) => void): () => void {
    this.stdoutListeners.push(listener);
    return () => {
      const idx = this.stdoutListeners.indexOf(listener);
      if (idx >= 0) {
        this.stdoutListeners.splice(idx, 1);
      }
    };
  }

  /** 监听 stderr */
  onStderr(listener: (chunk: string) => void): () => void {
    this.stderrListeners.push(listener);
    return () => {
      const idx = this.stderrListeners.indexOf(listener);
      if (idx >= 0) {
        this.stderrListeners.splice(idx, 1);
      }
    };
  }

  /** 监听 IPC 消息 */
  onIPCMessage(listener: (message: IPCMessage) => void): () => void {
    this.ipcListeners.push(listener);
    return () => {
      const idx = this.ipcListeners.indexOf(listener);
      if (idx >= 0) {
        this.ipcListeners.splice(idx, 1);
      }
    };
  }

  /** stdin 是否已关闭 */
  isStdinClosed(): boolean {
    return this.stdinClosed;
  }

  private handleStdout(chunk: string): void {
    this.events.onStdout?.(chunk);
    for (const l of [...this.stdoutListeners]) {
      try {
        l(chunk);
      } catch (err) {
        logger.debug(`[Process:Communicator] stdout listener threw: ${err}`);
      }
    }
  }

  private handleStderr(chunk: string): void {
    this.events.onStderr?.(chunk);
    for (const l of [...this.stderrListeners]) {
      try {
        l(chunk);
      } catch (err) {
        logger.debug(`[Process:Communicator] stderr listener threw: ${err}`);
      }
    }
  }

  private handleIPCMessage(message: unknown): void {
    const msg = this.normalizeIPCMessage(message);
    if (!msg) {
      logger.debug(`[Process:Communicator] invalid IPC message: ${typeof message}`);
      return;
    }
    this.events.onIPCMessage?.(msg);
    for (const l of [...this.ipcListeners]) {
      try {
        l(msg);
      } catch (err) {
        logger.debug(`[Process:Communicator] IPC listener threw: ${err}`);
      }
    }
  }

  private normalizeIPCMessage(message: unknown): IPCMessage | null {
    if (typeof message === 'string') {
      try {
        const parsed = JSON.parse(message);
        if (parsed && typeof parsed === 'object' && typeof parsed.type === 'string') {
          return parsed as IPCMessage;
        }
      } catch {
        return { type: 'raw', payload: message };
      }
      return { type: 'raw', payload: message };
    }
    if (message && typeof message === 'object' && typeof (message as { type?: unknown }).type === 'string') {
      return message as IPCMessage;
    }
    return null;
  }
}

/**
 * Bash/Exec 执行器实现
 *
 * 支持 PTY 模式、超时控制、后台进程管理、输出截断
 *
 * 参考自 OpenClaw bash-tools.exec-runtime.ts
 */

import { spawn, ChildProcess, SpawnOptions } from 'node:child_process';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import type {
  ExecToolParams,
  ExecResult,
  ProcessSession,
  ProcessAction,
  ProcessToolParams,
} from './bashSchemas.js';
import { evaluateSandboxPolicy, getSandboxPolicy } from './sandboxPolicy.js';

// ===================== 常量配置 =====================

/** 默认超时时间（毫秒） */
const DEFAULT_TIMEOUT_MS = 30_000;

/** 最大超时时间（毫秒） */
const MAX_TIMEOUT_MS = 3_600_000; // 1 小时

/** 默认输出截断长度（字符） */
const DEFAULT_MAX_OUTPUT_CHARS = 200_000;

/** 后台进程输出截断长度 */
const DEFAULT_PENDING_OUTPUT_CHARS = 30_000;

/** 默认后台等待时间（毫秒） */
const DEFAULT_YIELD_MS = 10_000;

/** 会话 ID 长度 */
const SESSION_ID_LENGTH = 12;

/** Shell 配置 */
const SHELL_CONFIG = {
  // macOS/Linux 默认 shell
  darwin: { shell: '/bin/zsh', args: ['-c'] },
  linux: { shell: '/bin/bash', args: ['-c'] },
  // Windows 使用 PowerShell
  win32: { shell: 'powershell.exe', args: ['-Command'] },
};

// ===================== Process Session Registry =====================

/** 后台进程会话注册表 */
const processSessions = new Map<string, InternalProcessSession>();

/** 内部进程会话结构（扩展 ProcessSession） */
interface InternalProcessSession extends ProcessSession {
  /** 子进程实例 */
  child?: ChildProcess;
  /** stdin 流 */
  stdin?: NodeJS.WritableStream;
  /** 待发送的 stdout 缓冲 */
  pendingStdout: string[];
  /** 待发送的 stderr 缓冲 */
  pendingStderr: string[];
  /** stdout 字符计数 */
  stdoutChars: number;
  /** stderr 字符计数 */
  stderrChars: number;
  /** 总输出字符数 */
  totalChars: number;
  /** 输出缓冲 */
  outputBuffer: string;
  /** stderr 缓冲 */
  errorBuffer: string;
  /** 最大输出字符数 */
  maxOutputChars: number;
  /** 后台输出最大字符数 */
  pendingMaxChars: number;
  /** 进程启动 Promise */
  startedPromise?: Promise<void>;
  /** 进程退出 Promise */
  exitPromise?: Promise<ExecResult>;
  /** 输出事件发射器 */
  outputEmitter: EventEmitter;
  /** 是否已通知退出 */
  exitNotified: boolean;
}

/** 生成会话 ID */
function generateSessionId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < SESSION_ID_LENGTH; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `exec_${result}`;
}

/** 获取 Shell 配置 */
function getShellConfig(): { shell: string; args: string[] } {
  const platform = process.platform;
  return SHELL_CONFIG[platform as keyof typeof SHELL_CONFIG] || SHELL_CONFIG.linux;
}

/** 获取安全的超时时间 */
function getSafeTimeout(timeoutSec?: number): number {
  if (typeof timeoutSec !== 'number' || timeoutSec <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.min(Math.floor(timeoutSec * 1000), MAX_TIMEOUT_MS);
}

/** 截断输出字符串 */
function truncateOutput(output: string, maxLength: number): string {
  if (output.length <= maxLength) {
    return output;
  }
  const truncated = output.length - maxLength;
  return `[截断 ${truncated} 字符]\n` + output.slice(-maxLength);
}

/** 添加会话 */
function addSession(session: InternalProcessSession): void {
  processSessions.set(session.id, session);
}

/** 获取会话 */
function getSession(sessionId: string): InternalProcessSession | undefined {
  return processSessions.get(sessionId);
}

/** 移除会话 */
function removeSession(sessionId: string): boolean {
  return processSessions.delete(sessionId);
}

/** 列出所有会话 */
function listSessions(): ProcessSession[] {
  return Array.from(processSessions.values()).map((s) => ({
    id: s.id,
    command: s.command,
    pid: s.pid,
    startedAt: s.startedAt,
    cwd: s.cwd,
    exited: s.exited,
    exitCode: s.exitCode,
    exitSignal: s.exitSignal,
    backgrounded: s.backgrounded,
    truncated: s.truncated,
    aggregated: s.outputBuffer.slice(-DEFAULT_PENDING_OUTPUT_CHARS),
  }));
}

/** 标记会话已退出 */
function markSessionExited(
  session: InternalProcessSession,
  exitCode: number | null,
  exitSignal: string | null,
  reason?: string
): void {
  session.exited = true;
  session.exitCode = exitCode;
  session.exitSignal = exitSignal;
  if (reason) {
    session.errorBuffer += `\n[退出原因: ${reason}]`;
  }
}

/** 追加输出到会话 */
function appendSessionOutput(
  session: InternalProcessSession,
  type: 'stdout' | 'stderr',
  data: string
): void {
  const chunk = data;
  const chars = chunk.length;

  if (type === 'stdout') {
    session.stdoutChars += chars;
    session.pendingStdout.push(chunk);
  } else {
    session.stderrChars += chars;
    session.pendingStderr.push(chunk);
  }

  session.totalChars += chars;

  // 合并输出
  session.outputBuffer += chunk;
  if (session.outputBuffer.length > session.maxOutputChars) {
    session.truncated = true;
    session.outputBuffer = truncateOutput(session.outputBuffer, session.maxOutputChars);
  }

  // 发射输出事件
  session.outputEmitter.emit('output', { type, data: chunk });
}

// ===================== Exec 执行器 =====================

export interface ExecOptions {
  /** 工具参数 */
  params: ExecToolParams;
  /** 额外配置 */
  config?: {
    /** 最大输出字符数 */
    maxOutputChars?: number;
    /** 后台最大输出字符数 */
    pendingMaxChars?: number;
    /** 会话 ID（可选，自动生成） */
    sessionId?: string;
    /** 回调：进程启动 */
    onStart?: (session: ProcessSession) => void;
    /** 回调：输出更新 */
    onUpdate?: (output: { stdout: string; stderr: string }) => void;
    /** 回调：进程退出 */
    onExit?: (result: ExecResult) => void;
  };
}

/**
 * 执行命令
 *
 * @param options - 执行选项
 * @returns 执行结果 Promise
 */
export async function executeCommand(options: ExecOptions): Promise<ExecResult> {
  const { params, config } = options;
  const startedAt = Date.now();
  const sessionId = config?.sessionId || generateSessionId();
  const timeoutMs = getSafeTimeout(params.timeout);
  const maxOutputChars = config?.maxOutputChars || DEFAULT_MAX_OUTPUT_CHARS;
  const pendingMaxChars = config?.pendingMaxChars || DEFAULT_PENDING_OUTPUT_CHARS;

  // 沙箱策略评估
  const sandboxResult = evaluateSandboxPolicy({
    command: params.command,
    cwd: params.workdir,
  });

  if (!sandboxResult.allowed) {
    return {
      status: 'failed',
      stdout: '',
      stderr: sandboxResult.reason,
      exitCode: null,
      exitSignal: null,
      durationMs: 0,
      timedOut: false,
      reason: sandboxResult.reason,
      failureKind: 'aborted',
    };
  }

  // 解析工作目录
  const cwd = params.workdir
    ? path.resolve(params.workdir)
    : process.cwd();

  // 构建环境变量
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    ...params.env,
  };

  // 获取 Shell 配置
  const { shell, args } = getShellConfig();

  // 创建会话对象
  const session: InternalProcessSession = {
    id: sessionId,
    command: params.command,
    pid: undefined,
    startedAt,
    cwd,
    exited: false,
    exitCode: undefined,
    exitSignal: undefined,
    backgrounded: params.background === true,
    truncated: false,
    aggregated: '',
    pendingStdout: [],
    pendingStderr: [],
    stdoutChars: 0,
    stderrChars: 0,
    totalChars: 0,
    outputBuffer: '',
    errorBuffer: '',
    maxOutputChars,
    pendingMaxChars,
    outputEmitter: new EventEmitter(),
    exitNotified: false,
  };

  addSession(session);

  // 构建 spawn 选项
  const spawnOptions: SpawnOptions = {
    cwd,
    env,
    shell: false, // 我们手动使用 shell
    stdio: ['pipe', 'pipe', 'pipe'],
  };

  // 执行命令
  return new Promise<ExecResult>((resolve, reject) => {
    let timeoutTimer: NodeJS.Timeout | null = null;
    let yieldTimer: NodeJS.Timeout | null = null;
    let resolved = false;
    let yielded = false;

    // 构建命令参数
    const fullArgs = [...args, params.command];

    // 启动进程
    const child = spawn(shell, fullArgs, spawnOptions);
    session.child = child;
    session.stdin = child.stdin as unknown as NodeJS.WritableStream;

    if (child.pid) {
      session.pid = child.pid;
    }

    // 调用启动回调
    config?.onStart?.({
      id: sessionId,
      command: params.command,
      pid: child.pid,
      startedAt,
      cwd,
      exited: false,
      backgrounded: session.backgrounded,
      truncated: false,
      aggregated: '',
    });

    // 设置超时
    if (timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          child.kill('SIGKILL');
          markSessionExited(session, null, 'SIGKILL', 'timeout');
          const result: ExecResult = {
            status: 'timeout',
            stdout: session.outputBuffer,
            stderr: session.errorBuffer,
            exitCode: null,
            exitSignal: 'SIGKILL',
            durationMs: Date.now() - startedAt,
            timedOut: true,
            sessionId,
            pid: session.pid,
            cwd,
            reason: `命令执行超时（${Math.floor(timeoutMs / 1000)}秒）`,
            failureKind: 'overall-timeout',
          };
          config?.onExit?.(result);
          resolve(result);
        }
      }, timeoutMs);
    }

    // 后台模式：yield 后返回
    if (params.background || params.yieldMs) {
      const yieldMs = params.yieldMs || DEFAULT_YIELD_MS;
      yieldTimer = setTimeout(() => {
        if (!resolved && !yielded) {
          yielded = true;
          session.backgrounded = true;
          // 返回 running 状态，进程继续运行
          const result: ExecResult = {
            status: 'running',
            stdout: '',
            stderr: '',
            exitCode: null,
            exitSignal: null,
            durationMs: Date.now() - startedAt,
            timedOut: false,
            sessionId,
            pid: session.pid,
            cwd,
          };
          resolve(result);
        }
      }, yieldMs);
    }

    // 处理 stdout
    child.stdout?.on('data', (data: Buffer) => {
      const str = data.toString('utf-8');
      appendSessionOutput(session, 'stdout', str);
      config?.onUpdate?.({
        stdout: str,
        stderr: '',
      });
    });

    // 处理 stderr
    child.stderr?.on('data', (data: Buffer) => {
      const str = data.toString('utf-8');
      appendSessionOutput(session, 'stderr', str);
      session.errorBuffer += str;
      config?.onUpdate?.({
        stdout: '',
        stderr: str,
      });
    });

    // 处理错误
    child.on('error', (err: Error) => {
      if (!resolved) {
        resolved = true;
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (yieldTimer) clearTimeout(yieldTimer);
        markSessionExited(session, null, null, err.message);
        const result: ExecResult = {
          status: 'failed',
          stdout: session.outputBuffer,
          stderr: session.errorBuffer + '\n' + err.message,
          exitCode: null,
          exitSignal: null,
          durationMs: Date.now() - startedAt,
          timedOut: false,
          sessionId,
          pid: session.pid,
          cwd,
          reason: err.message,
          failureKind: 'runtime-error',
        };
        config?.onExit?.(result);
        resolve(result);
      }
    });

    // 处理退出
    child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      if (!resolved) {
        resolved = true;
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (yieldTimer) clearTimeout(yieldTimer);

        const exitCode = code ?? 0;
        const exitSignal = signal ? String(signal) : null;
        const durationMs = Date.now() - startedAt;

        markSessionExited(session, exitCode, exitSignal);

        // 判断执行状态
        let status: 'completed' | 'failed' = 'completed';
        let failureKind: string | undefined;
        let reason: string | undefined;

        if (signal) {
          status = 'failed';
          failureKind = 'signal';
          reason = `进程被信号 ${signal} 终止`;
        } else if (exitCode === 127) {
          status = 'failed';
          failureKind = 'shell-command-not-found';
          reason = '命令未找到';
        } else if (exitCode === 126) {
          status = 'failed';
          failureKind = 'shell-not-executable';
          reason = '命令不可执行（权限不足）';
        } else if (exitCode !== 0) {
          // 非零退出码但仍返回 completed（包含错误信息）
          status = 'completed';
        }

        const result: ExecResult = {
          status,
          stdout: session.outputBuffer,
          stderr: session.errorBuffer,
          exitCode,
          exitSignal,
          durationMs,
          timedOut: false,
          sessionId,
          pid: session.pid,
          cwd,
          reason,
          failureKind: failureKind as ExecResult['failureKind'],
        };

        config?.onExit?.(result);
        resolve(result);
      }
    });
  });
}

// ===================== Process 控制函数 =====================

/**
 * 处理进程控制操作
 *
 * @param params - Process 工具参数
 * @returns 操作结果
 */
export async function handleProcessAction(params: ProcessToolParams): Promise<string> {
  const { action, sessionId } = params;

  switch (action) {
    case 'list':
      return JSON.stringify(listSessions(), null, 2);

    case 'poll':
      return handleProcessPoll(sessionId, params.timeout);

    case 'log':
      return handleProcessLog(sessionId, params.offset, params.limit);

    case 'write':
      return handleProcessWrite(sessionId, params.data, params.eof);

    case 'send-keys':
      return handleProcessSendKeys(sessionId, params.keys, params.hex, params.literal);

    case 'submit':
      return handleProcessWrite(sessionId, params.data, true);

    case 'paste':
      return handleProcessPaste(sessionId, params.text, params.bracketed);

    case 'kill':
      return handleProcessKill(sessionId);

    case 'clear':
      return handleProcessClear(sessionId);

    case 'remove':
      return handleProcessRemove(sessionId);

    default:
      return JSON.stringify({ error: `未知的操作: ${action}` });
  }
}

/** 处理 poll 操作 */
async function handleProcessPoll(
  sessionId: string | undefined,
  timeoutMs?: number
): Promise<string> {
  if (!sessionId) {
    return JSON.stringify({ error: 'sessionId 是必需参数' });
  }

  const session = getSession(sessionId);
  if (!session) {
    return JSON.stringify({ error: `会话不存在: ${sessionId}` });
  }

  const waitMs = Math.min(timeoutMs || 5000, 30000);

  return new Promise<string>((resolve) => {
    // 如果进程已退出，立即返回
    if (session.exited) {
      resolve(JSON.stringify({
        status: 'exited',
        exitCode: session.exitCode,
        exitSignal: session.exitSignal,
        stdout: session.outputBuffer.slice(-session.pendingMaxChars),
        stderr: session.errorBuffer,
      }));
      return;
    }

    // 等待新输出
    // eslint-disable-next-line prefer-const
    let timer: NodeJS.Timeout;
    let resolved = false;

    const finish = (output?: string) => {
      if (resolved) return;
      resolved = true;
      if (timer) clearTimeout(timer);

      resolve(JSON.stringify({
        status: session.exited ? 'exited' : 'running',
        exitCode: session.exitCode,
        exitSignal: session.exitSignal,
        stdout: (output || session.pendingStdout.join('')).slice(-session.pendingMaxChars),
        stderr: session.pendingStderr.join(''),
      }));

      // 清空待处理缓冲
      session.pendingStdout = [];
      session.pendingStderr = [];
    };

    // 监听输出
    session.outputEmitter.once('output', (data) => {
      finish(data.data);
    });

    // 设置超时
    timer = setTimeout(() => {
      finish();
    }, waitMs);
  });
}

/** 处理 log 操作 */
function handleProcessLog(
  sessionId: string | undefined,
  offset?: number,
  limit?: number
): Promise<string> {
  if (!sessionId) {
    return Promise.resolve(JSON.stringify({ error: 'sessionId 是必需参数' }));
  }

  const session = getSession(sessionId);
  if (!session) {
    return Promise.resolve(JSON.stringify({ error: `会话不存在: ${sessionId}` }));
  }

  const startOffset = offset || 0;
  const logLimit = limit || 1000;
  const fullOutput = session.outputBuffer + session.errorBuffer;
  const sliced = fullOutput.slice(startOffset, startOffset + logLimit);

  return Promise.resolve(JSON.stringify({
    sessionId,
    offset: startOffset,
    length: sliced.length,
    total: fullOutput.length,
    exited: session.exited,
    log: sliced,
  }));
}

/** 处理 write 操作 */
function handleProcessWrite(
  sessionId: string | undefined,
  data?: string,
  eof?: boolean
): Promise<string> {
  if (!sessionId) {
    return Promise.resolve(JSON.stringify({ error: 'sessionId 是必需参数' }));
  }

  const session = getSession(sessionId);
  if (!session) {
    return Promise.resolve(JSON.stringify({ error: `会话不存在: ${sessionId}` }));
  }

  if (session.exited) {
    return Promise.resolve(JSON.stringify({ error: '进程已退出，无法写入' }));
  }

  const stdin = session.stdin;
  if (!stdin || (stdin as any).destroyed) {
    return Promise.resolve(JSON.stringify({ error: 'stdin 不可用' }));
  }

  try {
    if (data) {
      stdin.write(data);
    }
    if (eof) {
      stdin.end();
    }
    return Promise.resolve(JSON.stringify({ success: true, written: data?.length || 0 }));
  } catch (err) {
    return Promise.resolve(JSON.stringify({
      error: `写入失败: ${err instanceof Error ? err.message : String(err)}`
    }));
  }
}

/** 处理 send-keys 操作 */
function handleProcessSendKeys(
  sessionId: string | undefined,
  keys?: string[],
  hex?: string[],
  literal?: string
): Promise<string> {
  if (!sessionId) {
    return Promise.resolve(JSON.stringify({ error: 'sessionId 是必需参数' }));
  }

  const session = getSession(sessionId);
  if (!session) {
    return Promise.resolve(JSON.stringify({ error: `会话不存在: ${sessionId}` }));
  }

  if (session.exited) {
    return Promise.resolve(JSON.stringify({ error: '进程已退出，无法发送按键' }));
  }

  const stdin = session.stdin;
  if (!stdin || (stdin as any).destroyed) {
    return Promise.resolve(JSON.stringify({ error: 'stdin 不可用' }));
  }

  try {
    // 发送按键序列
    if (keys && keys.length > 0) {
      for (const key of keys) {
        // 特殊按键映射
        const mapped = mapSpecialKey(key);
        stdin.write(mapped);
      }
    }

    // 发送十六进制字节
    if (hex && hex.length > 0) {
      for (const h of hex) {
        const byte = parseInt(h, 16);
        if (byte >= 0 && byte <= 255) {
          stdin.write(Buffer.from([byte]));
        }
      }
    }

    // 发送字面文本
    if (literal) {
      stdin.write(literal);
    }

    return Promise.resolve(JSON.stringify({
      success: true,
      keysSent: keys?.length || 0,
      hexSent: hex?.length || 0,
      literalSent: literal?.length || 0
    }));
  } catch (err) {
    return Promise.resolve(JSON.stringify({
      error: `发送按键失败: ${err instanceof Error ? err.message : String(err)}`
    }));
  }
}

/** 特殊按键映射 */
function mapSpecialKey(key: string): string {
  const specialKeys: Record<string, string> = {
    'Enter': '\n',
    'Return': '\n',
    'Tab': '\t',
    'Escape': '\x1b',
    'Esc': '\x1b',
    'Backspace': '\x7f',
    'Delete': '\x1b[3~',
    'ArrowUp': '\x1b[A',
    'ArrowDown': '\x1b[B',
    'ArrowLeft': '\x1b[D',
    'ArrowRight': '\x1b[C',
    'Home': '\x1b[H',
    'End': '\x1b[F',
    'PageUp': '\x1b[5~',
    'PageDown': '\x1b[6~',
    'CtrlC': '\x03',
    'CtrlD': '\x04',
    'CtrlZ': '\x1a',
    'CtrlL': '\x0c',
    'CtrlA': '\x01',
    'CtrlE': '\x05',
    'CtrlK': '\x0b',
    'CtrlU': '\x15',
    'CtrlW': '\x17',
    'CtrlR': '\x12',
    'CtrlP': '\x10',
    'CtrlN': '\x0e',
    'CtrlB': '\x02',
    'CtrlF': '\x06',
  };

  // 检查是否是组合键（如 Ctrl+X）
  if (key.startsWith('Ctrl+') && key.length === 6) {
    const char = key.charAt(5).toLowerCase();
    const code = char.charCodeAt(0) - 96; // a=1, b=2, ...
    if (code >= 1 && code <= 26) {
      return String.fromCharCode(code);
    }
  }

  return specialKeys[key] || key;
}

/** 处理 paste 操作 */
function handleProcessPaste(
  sessionId: string | undefined,
  text?: string,
  bracketed?: boolean
): Promise<string> {
  if (!sessionId) {
    return Promise.resolve(JSON.stringify({ error: 'sessionId 是必需参数' }));
  }

  if (!text) {
    return Promise.resolve(JSON.stringify({ error: 'text 是必需参数' }));
  }

  const session = getSession(sessionId);
  if (!session) {
    return Promise.resolve(JSON.stringify({ error: `会话不存在: ${sessionId}` }));
  }

  if (session.exited) {
    return Promise.resolve(JSON.stringify({ error: '进程已退出，无法粘贴' }));
  }

  const stdin = session.stdin;
  if (!stdin || (stdin as any).destroyed) {
    return Promise.resolve(JSON.stringify({ error: 'stdin 不可用' }));
  }

  try {
    // Bracketed paste 模式：包裹文本
    if (bracketed) {
      stdin.write('\x1b[200~' + text + '\x1b[201~');
    } else {
      stdin.write(text);
    }

    return Promise.resolve(JSON.stringify({ success: true, pasted: text.length }));
  } catch (err) {
    return Promise.resolve(JSON.stringify({
      error: `粘贴失败: ${err instanceof Error ? err.message : String(err)}`
    }));
  }
}

/** 处理 kill 操作 */
function handleProcessKill(sessionId: string | undefined): Promise<string> {
  if (!sessionId) {
    return Promise.resolve(JSON.stringify({ error: 'sessionId 是必需参数' }));
  }

  const session = getSession(sessionId);
  if (!session) {
    return Promise.resolve(JSON.stringify({ error: `会话不存在: ${sessionId}` }));
  }

  if (session.exited) {
    return Promise.resolve(JSON.stringify({ error: '进程已退出', exitCode: session.exitCode }));
  }

  const child = session.child;
  if (child) {
    try {
      child.kill('SIGTERM');
      // 3秒后强制终止
      setTimeout(() => {
        if (!session.exited) {
          child.kill('SIGKILL');
        }
      }, 3000);
      return Promise.resolve(JSON.stringify({ success: true, signal: 'SIGTERM' }));
    } catch (err) {
      return Promise.resolve(JSON.stringify({
        error: `终止进程失败: ${err instanceof Error ? err.message : String(err)}`
      }));
    }
  }

  return Promise.resolve(JSON.stringify({ error: '无法终止进程' }));
}

/** 处理 clear 操作 */
function handleProcessClear(sessionId: string | undefined): Promise<string> {
  if (!sessionId) {
    return Promise.resolve(JSON.stringify({ error: 'sessionId 是必需参数' }));
  }

  const session = getSession(sessionId);
  if (!session) {
    return Promise.resolve(JSON.stringify({ error: `会话不存在: ${sessionId}` }));
  }

  // 清空缓冲
  session.outputBuffer = '';
  session.errorBuffer = '';
  session.pendingStdout = [];
  session.pendingStderr = [];
  session.stdoutChars = 0;
  session.stderrChars = 0;
  session.totalChars = 0;
  session.truncated = false;

  return Promise.resolve(JSON.stringify({ success: true }));
}

/** 处理 remove 操作 */
function handleProcessRemove(sessionId: string | undefined): Promise<string> {
  if (!sessionId) {
    return Promise.resolve(JSON.stringify({ error: 'sessionId 是必需参数' }));
  }

  const session = getSession(sessionId);
  if (!session) {
    return Promise.resolve(JSON.stringify({ error: `会话不存在: ${sessionId}` }));
  }

  if (!session.exited) {
    return Promise.resolve(JSON.stringify({ error: '进程仍在运行，请先终止进程' }));
  }

  removeSession(sessionId);
  return Promise.resolve(JSON.stringify({ success: true, removed: sessionId }));
}

// ===================== 导出 =====================

export {
  generateSessionId,
  getShellConfig,
  getSafeTimeout,
  truncateOutput,
  addSession,
  getSession,
  removeSession,
  listSessions,
  markSessionExited,
  appendSessionOutput,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_OUTPUT_CHARS,
  DEFAULT_PENDING_OUTPUT_CHARS,
  DEFAULT_YIELD_MS,
};

export type { InternalProcessSession };
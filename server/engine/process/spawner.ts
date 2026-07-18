/**
 * 进程生成器
 *
 * 封装 child_process.spawn / fork，构建 SpawnAdapter 供上层使用。
 * 通过依赖注入支持在测试中替换 spawn 实现。
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { logger } from '../../logger.js';
import type { ProcessConfig, SpawnAdapter } from './types.js';

/** Spawn 依赖注入接口 */
export interface SpawnDeps {
  spawn?: typeof spawn;
  /** 时间源（用于测试） */
  now?: () => number;
}

/** 默认单流最大保留字符数 */
const DEFAULT_MAX_CAPTURED_CHARS = 1024 * 1024;

/** 解析后的 Spawn 参数 */
export interface ParsedSpawnArgs {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  cwd?: string;
  stdio: Array<'ignore' | 'pipe' | 'inherit' | 'ipc'>;
}

/** 解析 ProcessConfig 生成 spawn 参数 */
export function parseSpawnArgs(config: ProcessConfig): ParsedSpawnArgs {
  if (!config.command) {
    throw new Error('spawn command cannot be empty');
  }
  const args = config.args ?? [];
  const env: NodeJS.ProcessEnv = { ...process.env, ...config.env };
  // stdin 配置：有 input 时 pipe，否则 inherit；ipc 模式下使用 'ipc'
  const stdio: ParsedSpawnArgs['stdio'] = [
    config.input !== undefined ? 'pipe' : 'inherit',
    'pipe',
    'pipe',
  ];
  if (config.ipc) {
    stdio.push('ipc');
  }
  return {
    command: config.command,
    args,
    env,
    cwd: config.cwd,
    stdio,
  };
}

/**
 * 创建 SpawnAdapter
 *
 * - 调用注入的 spawn 或 node:child_process.spawn
 * - 注册 stdout/stderr/error/exit 监听
 * - 返回标准化的适配器接口
 */
export function createSpawnAdapter(
  config: ProcessConfig,
  deps?: SpawnDeps,
): SpawnAdapter {
  const spawnFn = deps?.spawn ?? spawn;
  const parsed = parseSpawnArgs(config);

  logger.debug(
    `[Process:Spawner] spawn command=${parsed.command} args=${JSON.stringify(parsed.args)} ipc=${!!config.ipc}`,
  );

  const child: ChildProcess = spawnFn(parsed.command, parsed.args, {
    stdio: parsed.stdio,
    cwd: parsed.cwd,
    env: parsed.env,
  });

  const stdoutListeners: Array<(chunk: string) => void> = [];
  const stderrListeners: Array<(chunk: string) => void> = [];
  const ipcListeners: Array<(message: unknown) => void> = [];
  let exitResolve: ((value: { code: number | null; signal: NodeJS.Signals | null }) => void) | null = null;
  let settled = false;
  let exitResult: { code: number | null; signal: NodeJS.Signals | null } | null = null;

  const waitPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    exitResolve = resolve;
  });

  child.stdout?.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8');
    for (const l of [...stdoutListeners]) {
      l(text);
    }
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8');
    for (const l of [...stderrListeners]) {
      l(text);
    }
  });
  if (config.ipc) {
    child.on('message', (message: unknown) => {
      for (const l of [...ipcListeners]) {
        l(message);
      }
    });
  }
  child.once('error', (err: Error) => {
    logger.warn(`[Process:Spawner] spawn error: ${err.message}`);
    if (!settled) {
      settled = true;
      exitResult = { code: null, signal: null };
      exitResolve?.(exitResult);
    }
  });
  child.once('exit', (code, signal) => {
    if (!settled) {
      settled = true;
      exitResult = { code: code ?? null, signal: signal ?? null };
      exitResolve?.(exitResult);
    }
  });

  const adapter: SpawnAdapter = {
    pid: typeof child.pid === 'number' ? child.pid : undefined,
    stdin: child.stdin
      ? {
          write: (data: string) => {
            child.stdin?.write(data);
          },
          end: () => {
            child.stdin?.end();
          },
          get destroyed() {
            return child.stdin?.destroyed ?? false;
          },
        }
      : undefined,
    onStdout: (listener) => {
      stdoutListeners.push(listener);
    },
    onStderr: (listener) => {
      stderrListeners.push(listener);
    },
    onIPCMessage: config.ipc
      ? (listener) => {
          ipcListeners.push(listener);
        }
      : undefined,
    wait: async () => waitPromise,
    kill: (signal?: NodeJS.Signals) => {
      try {
        child.kill(signal ?? 'SIGTERM');
      } catch (err) {
        logger.warn(`[Process:Spawner] kill failed: ${err}`);
      }
    },
    dispose: () => {
      stdoutListeners.length = 0;
      stderrListeners.length = 0;
      ipcListeners.length = 0;
      // 不主动 kill；让上层决定
      if (!settled) {
        try {
          child.kill('SIGKILL');
        } catch {
          // ignore
        }
      }
    },
  };
  return adapter;
}

/** 解析最大保留字符数 */
export function resolveMaxCapturedChars(value?: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_MAX_CAPTURED_CHARS;
  }
  return Math.max(256, Math.floor(value));
}

/** 追加输出，超限时截断尾部并加标记 */
export function appendCapturedOutput(
  current: string,
  chunk: string,
  stream: 'stdout' | 'stderr',
  maxChars: number,
): string {
  const next = current + chunk;
  if (next.length <= maxChars) {
    return next;
  }
  const marker = `[process: captured ${stream} truncated to last ${maxChars} chars]\n`;
  const tailChars = Math.max(0, maxChars - marker.length);
  return `${marker}${next.slice(-tailChars)}`;
}

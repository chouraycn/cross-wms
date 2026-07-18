/**
 * ACP 子进程 spawn 工具
 *
 * 提供 ACP（Agent Control Protocol）子进程的启动能力，
 * 封装 node:child_process 的 spawn，统一 stdin/stdout/stderr 的访问入口。
 *
 * 与 openclaw/src/agents/acp-spawn.ts 中复杂的会话/线程绑定逻辑不同，
 * 本模块仅关注子进程的启动与标准流的句柄返回，便于上层进行协议通信。
 *
 * 参考自 openclaw/src/agents/acp-spawn.ts。
 */
import { spawn, type ChildProcess } from 'node:child_process';
import type { Writable, Readable } from 'node:stream';
import { logger } from '../../logger.js';

/** spawnAcpProcess 的选项。 */
export interface SpawnAcpProcessOptions {
  /** 可执行文件路径或命令名。 */
  command: string;
  /** 命令参数列表，默认为空数组。 */
  args?: string[];
  /** 子进程工作目录；默认继承父进程。 */
  cwd?: string;
  /** 传递给子进程的环境变量；默认继承父进程。 */
  env?: NodeJS.ProcessEnv;
  /** 是否分离为独立进程组（detached）。默认 false。 */
  detached?: boolean;
  /** Windows 下是否隐藏控制台窗口。默认 true。 */
  windowsHide?: boolean;
  /** 触发 spawn 错误时的回调（例如命令不存在）。 */
  onError?: (error: Error) => void;
}

/** spawnAcpProcess 返回的进程句柄。 */
export interface SpawnAcpProcessHandle {
  /** 子进程实例。 */
  process: ChildProcess;
  /** 子进程标准输入流（pipe 模式下保证非空）。 */
  stdin: Writable;
  /** 子进程标准输出流（pipe 模式下保证非空）。 */
  stdout: Readable;
  /** 子进程标准错误流（pipe 模式下保证非空）。 */
  stderr: Readable;
}

/**
 * 启动 ACP 子进程，返回标准化后的进程句柄。
 *
 * 内部使用 node:child_process 的 spawn，并以 pipe 方式暴露 stdin/stdout/stderr，
 * 便于上层通过标准流进行 ACP 协议通信。
 *
 * @param options spawn 选项
 * @throws 当 command 为空时抛出 Error
 */
export function spawnAcpProcess(options: SpawnAcpProcessOptions): SpawnAcpProcessHandle {
  const {
    command,
    args = [],
    cwd,
    env,
    detached = false,
    windowsHide = true,
    onError,
  } = options;

  if (!command || typeof command !== 'string') {
    throw new Error('spawnAcpProcess requires a non-empty command.');
  }

  const child = spawn(command, args, {
    cwd,
    env: env ?? process.env,
    detached,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide,
  });

  // spawn 错误（如命令不存在）通过 'error' 事件抛出，这里统一记录并转发给回调
  child.on('error', (err: Error) => {
    logger.error(`[Agents:AcpSpawn] Process error for "${command}": ${err.message}`);
    onError?.(err);
  });

  // stdio 配置为 pipe 时，stdin/stdout/stderr 必然存在，断言为非空
  return {
    process: child,
    stdin: child.stdin as Writable,
    stdout: child.stdout as Readable,
    stderr: child.stderr as Readable,
  };
}

logger.debug('[Agents:AcpSpawn] Module loaded');

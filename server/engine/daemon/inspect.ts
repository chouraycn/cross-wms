/**
 * 守护进程状态检查
 * 检查守护进程是否运行，获取 PID、运行时间、内存占用；健康检查（心跳检测）。
 * 参考 openclaw/src/daemon/inspect.ts 的架构对齐实现。
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { logger } from '../../logger.js';

/** 守护进程检查结果。 */
export interface DaemonInspectResult {
  /** 进程是否存活 */
  running: boolean;
  /** 进程 PID */
  pid?: number;
  /** 运行时长（毫秒） */
  uptimeMs?: number;
  /** 内存占用（字节） */
  memoryUsage?: number;
  /** 健康检查是否通过（进程存活且心跳未过期） */
  healthy?: boolean;
  /** 附加说明 */
  detail?: string;
}

export interface InspectDaemonOptions {
  /** 显式指定 PID；未提供则从 pidFile 读取 */
  pid?: number;
  /** PID 文件路径 */
  pidFile?: string;
  /** 心跳文件路径（文件 mtime 距今在阈值内视为健康） */
  heartbeatFile?: string;
  /** 心跳过期阈值（毫秒），默认 60s */
  heartbeatStaleMs?: number;
}

/** 执行系统命令的 Promise 封装。 */
function execCmd(file: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { encoding: 'utf8', windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const code = err ? (typeof err.code === 'number' ? err.code : 1) : 0;
        resolve({ stdout: stdout ?? '', stderr: stderr ?? '', code });
      },
    );
  });
}

/** 判断指定 PID 的进程是否存活。 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** 从 PID 文件读取 PID。 */
async function readPidFile(pidFile?: string): Promise<number | undefined> {
  if (!pidFile) return undefined;
  try {
    const content = await fs.readFile(pidFile, 'utf8');
    const pid = Number.parseInt(content.trim(), 10);
    return Number.isFinite(pid) && pid > 0 ? pid : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 通过 ps 命令获取进程的内存占用（字节）与运行时长（毫秒）。
 * 在 darwin/linux 上可用；其他平台返回 undefined。
 */
async function probeProcessStats(pid: number): Promise<{ memoryUsage?: number; uptimeMs?: number }> {
  if (process.platform !== 'darwin' && process.platform !== 'linux') {
    return {};
  }
  const res = await execCmd('ps', ['-o', 'rss=,etime=', '-p', String(pid)]);
  if (res.code !== 0) {
    return {};
  }
  const output = res.stdout.trim();
  if (!output) return {};
  // 输出形如："1234  01:02:03" 或 "1234  1-02:03:04"
  const parts = output.split(/\s+/);
  const rssKb = Number.parseInt(parts[0] ?? '', 10);
  const etime = parts.slice(1).join(' ');
  const memoryUsage = Number.isFinite(rssKb) ? rssKb * 1024 : undefined;
  const uptimeMs = parseEtimeToMs(etime);
  return { memoryUsage, uptimeMs };
}

/** 将 ps etime 字段（如 "1-02:03:04" 或 "02:03"）解析为毫秒。 */
function parseEtimeToMs(etime: string): number | undefined {
  if (!etime) return undefined;
  let days = 0;
  let rest = etime;
  const dayMatch = rest.match(/^(\d+)-(.+)$/);
  if (dayMatch) {
    days = Number.parseInt(dayMatch[1], 10);
    rest = dayMatch[2];
  }
  const timeParts = rest.split(':').map((p) => Number.parseInt(p, 10));
  if (timeParts.some((p) => !Number.isFinite(p))) return undefined;
  let hours = 0;
  let mins = 0;
  let secs = 0;
  if (timeParts.length === 3) {
    [hours, mins, secs] = timeParts;
  } else if (timeParts.length === 2) {
    [mins, secs] = timeParts;
  } else if (timeParts.length === 1) {
    [secs] = timeParts;
  } else {
    return undefined;
  }
  const totalMs =
    (((days * 24 + hours) * 60 + mins) * 60 + secs) * 1000;
  return totalMs >= 0 ? totalMs : undefined;
}

/** 检查心跳文件是否在阈值内更新过。 */
async function checkHeartbeat(
  heartbeatFile?: string,
  staleMs = 60_000,
): Promise<{ healthy: boolean; detail?: string }> {
  if (!heartbeatFile) return { healthy: true };
  try {
    const stat = await fs.stat(heartbeatFile);
    const age = Date.now() - stat.mtimeMs;
    if (age <= staleMs) {
      return { healthy: true };
    }
    return { healthy: false, detail: `心跳已过期（${Math.floor(age / 1000)}s 未更新）` };
  } catch {
    return { healthy: false, detail: '心跳文件不存在' };
  }
}

/**
 * 检查守护进程运行状态。
 * 优先使用显式 PID，其次读取 PID 文件；通过 process.kill(pid, 0) 判断存活，
 * 并在支持的平台上通过 ps 读取内存与运行时长；最后结合心跳文件判定健康。
 */
export async function inspectDaemon(options: InspectDaemonOptions = {}): Promise<DaemonInspectResult> {
  const pid = options.pid ?? (await readPidFile(options.pidFile));
  if (pid === undefined) {
    return { running: false, healthy: false, detail: '未找到 PID' };
  }

  if (!isProcessAlive(pid)) {
    return { running: false, pid, healthy: false, detail: `进程 ${pid} 未运行` };
  }

  const stats = await probeProcessStats(pid);
  const heartbeat = await checkHeartbeat(options.heartbeatFile, options.heartbeatStaleMs);

  logger.debug(`[daemon] inspect pid=${pid} running=true healthy=${heartbeat.healthy}`);

  return {
    running: true,
    pid,
    uptimeMs: stats.uptimeMs,
    memoryUsage: stats.memoryUsage,
    healthy: heartbeat.healthy,
    detail: heartbeat.detail,
  };
}

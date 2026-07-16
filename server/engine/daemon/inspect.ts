/**
 * 守护进程状态检查
 * 检查守护进程是否运行，获取 PID、运行时间、内存占用；健康检查（心跳检测）；
 * 扫描平台残留/遗留守护服务（参考 openclaw inspect 的 findExtraGatewayServices）。
 * 参考 openclaw/src/daemon/inspect.ts 的架构对齐实现。
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../../logger.js';
import { resolveHomeDir } from './paths.js';

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

/** 额外发现的守护服务条目（残留或遗留安装）。 */
export interface ExtraDaemonService {
  platform: 'darwin' | 'linux' | 'win32';
  label: string;
  detail: string;
  scope: 'user' | 'system';
  marker?: 'cdf-know' | 'legacy';
  legacy?: boolean;
}

export interface FindExtraDaemonServicesOptions {
  deep?: boolean;
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

/**
 * 生成当前平台守护服务的清理命令提示。
 * 参考 openclaw inspect renderGatewayServiceCleanupHints。
 */
export function renderDaemonServiceCleanupHints(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): string[] {
  switch (process.platform) {
    case 'darwin': {
      const label = env.CDF_LAUNCHD_LABEL?.trim() || 'com.cdf-know.daemon';
      return [`launchctl bootout gui/$UID/${label}`, `rm ~/Library/LaunchAgents/${label}.plist`];
    }
    case 'linux': {
      const unit = env.CDF_SYSTEMD_UNIT?.trim() || 'cdf-know-daemon';
      return [
        `systemctl --user disable --now ${unit}.service`,
        `rm ~/.config/systemd/user/${unit}.service`,
      ];
    }
    case 'win32': {
      const task = env.CDF_WINDOWS_TASK_NAME?.trim() || 'CrossWMSDaemon';
      return [`schtasks /Delete /TN "${task}" /F`];
    }
    default:
      return [];
  }
}

// --- 额外守护服务扫描 ---

const CDF_KNOW_MARKERS = ['cdf-know', 'com.cdf-know'] as const;

async function readDirEntries(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}

async function readUtf8File(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

function isLegacyLabel(label: string): boolean {
  const lower = label.toLowerCase();
  return lower.includes('openclaw') || lower.includes('clawdbot');
}

function detectMarkerInContent(contents: string): 'cdf-know' | 'legacy' | null {
  const lower = contents.toLowerCase();
  for (const marker of CDF_KNOW_MARKERS) {
    if (lower.includes(marker)) return 'cdf-know';
  }
  if (lower.includes('openclaw') || lower.includes('clawdbot')) return 'legacy';
  return null;
}

async function scanLaunchdDir(params: {
  dir: string;
  scope: 'user' | 'system';
  currentLabel: string;
}): Promise<ExtraDaemonService[]> {
  const results: ExtraDaemonService[] = [];
  const entries = await readDirEntries(params.dir);
  for (const entry of entries) {
    if (!entry.endsWith('.plist')) continue;
    const name = entry.slice(0, -'.plist'.length);
    if (name === params.currentLabel) continue;
    const fullPath = path.join(params.dir, entry);
    const contents = await readUtf8File(fullPath);
    if (!contents) continue;
    const marker = detectMarkerInContent(contents);
    if (!marker) continue;
    const legacy = marker === 'legacy' || isLegacyLabel(name);
    results.push({
      platform: 'darwin',
      label: name,
      detail: `plist: ${fullPath}`,
      scope: params.scope,
      marker,
      legacy,
    });
  }
  return results;
}

async function scanSystemdDir(params: {
  dir: string;
  scope: 'user' | 'system';
  currentUnitName: string;
}): Promise<ExtraDaemonService[]> {
  const results: ExtraDaemonService[] = [];
  const entries = await readDirEntries(params.dir);
  for (const entry of entries) {
    if (!entry.endsWith('.service')) continue;
    const name = entry.slice(0, -'.service'.length);
    if (name === params.currentUnitName) continue;
    const fullPath = path.join(params.dir, entry);
    const contents = await readUtf8File(fullPath);
    if (!contents) continue;
    const marker = detectMarkerInContent(contents);
    if (!marker) continue;
    results.push({
      platform: 'linux',
      label: entry,
      detail: `unit: ${fullPath}`,
      scope: params.scope,
      marker,
      legacy: marker !== 'cdf-know',
    });
  }
  return results;
}

/**
 * 扫描当前平台中残留/遗留的守护服务。
 * 参考 openclaw inspect findExtraGatewayServices。
 * 用于 install 前后对比、diagnostics 诊断等场景。
 */
export async function findExtraDaemonServices(
  env: Record<string, string | undefined>,
  opts: FindExtraDaemonServicesOptions = {},
): Promise<ExtraDaemonService[]> {
  const results: ExtraDaemonService[] = [];

  if (process.platform === 'darwin') {
    try {
      const home = resolveHomeDir(env);
      const currentLabel = env.CDF_LAUNCHD_LABEL?.trim() || 'com.cdf-know.daemon';
      const userDir = path.join(home, 'Library', 'LaunchAgents');
      results.push(...await scanLaunchdDir({ dir: userDir, scope: 'user', currentLabel }));
      if (opts.deep) {
        results.push(...await scanLaunchdDir({
          dir: path.join(path.sep, 'Library', 'LaunchAgents'),
          scope: 'system',
          currentLabel,
        }));
        results.push(...await scanLaunchdDir({
          dir: path.join(path.sep, 'Library', 'LaunchDaemons'),
          scope: 'system',
          currentLabel,
        }));
      }
    } catch {
      return results;
    }
    return results;
  }

  if (process.platform === 'linux') {
    try {
      const home = resolveHomeDir(env);
      const currentUnitName = env.CDF_SYSTEMD_UNIT?.trim() || 'cdf-know-daemon';
      const userDir = path.join(home, '.config', 'systemd', 'user');
      results.push(...await scanSystemdDir({ dir: userDir, scope: 'user', currentUnitName }));
      if (opts.deep) {
        for (const dir of ['/etc/systemd/system', '/usr/lib/systemd/system', '/lib/systemd/system']) {
          results.push(...await scanSystemdDir({ dir, scope: 'system', currentUnitName }));
        }
      }
    } catch {
      return results;
    }
    return results;
  }

  // Windows: schtasks 深度扫描（需 deep 选项）
  if (process.platform === 'win32' && opts.deep) {
    const res = await execCmd('schtasks', ['/Query', '/FO', 'LIST', '/V']);
    if (res.code !== 0) return results;
    const currentTaskName = (env.CDF_WINDOWS_TASK_NAME?.trim() || 'CrossWMSDaemon').toLowerCase();
    for (const rawLine of res.stdout.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      const idx = line.indexOf(':');
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim().toLowerCase();
      if (key !== 'taskname') continue;
      const name = line.slice(idx + 1).trim();
      if (!name || name.toLowerCase().replace(/^\\+/, '') === currentTaskName) continue;
      const lowerName = name.toLowerCase();
      let marker: 'cdf-know' | 'legacy' | null = null;
      if (lowerName.includes('cdf-know') || lowerName.includes('crosswms')) marker = 'cdf-know';
      else if (lowerName.includes('openclaw') || lowerName.includes('clawdbot')) marker = 'legacy';
      if (!marker) continue;
      results.push({
        platform: 'win32',
        label: name,
        detail: name,
        scope: 'system',
        marker,
        legacy: marker !== 'cdf-know',
      });
    }
  }

  return results;
}

/**
 * Linux systemd 守护进程管理
 * 生成 systemd user service 文件；启用/禁用；启动/停止；状态查询。
 * 参考 openclaw/src/daemon/systemd.ts 的架构对齐实现。
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../../logger.js';
import { resolveDaemonPaths, type DaemonPaths } from './paths.js';

export interface SystemdConfig {
  /** systemd 单元名称（不含 .service），默认 cdf-know-daemon */
  unitName?: string;
  /** 启动命令参数（第一项为可执行程序） */
  programArguments: string[];
  /** 工作目录 */
  workingDirectory?: string;
  /** 环境变量 */
  environment?: Record<string, string>;
  /** 自动重启（Restart=always），默认 true */
  restart?: boolean;
  /** 重启延迟（毫秒） */
  restartDelayMs?: number;
  /** 描述信息 */
  description?: string;
  /** 标准输出日志路径 */
  stdoutPath?: string;
  /** 标准错误日志路径 */
  stderrPath?: string;
  /** 状态目录覆盖 */
  stateDir?: string;
  /** 环境变量来源（用于解析主目录） */
  env?: Record<string, string | undefined>;
}

export interface SystemdStatus {
  installed: boolean;
  enabled: boolean;
  running: boolean;
  pid?: number;
  state?: string;
  subState?: string;
  lastExitStatus?: number;
  detail?: string;
}

/** 执行系统命令的 Promise 封装。 */
function execCmd(
  file: string,
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number }> {
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

/** 调用 systemctl --user。 */
function execSystemctlUser(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return execCmd('systemctl', ['--user', ...args]);
}

/** systemd ExecStart 参数引用：含空格/引号/反斜杠时用双引号包裹。 */
function quoteSystemdArg(value: string): string {
  if (value === '') return '""';
  if (/[\s"\\]/.test(value)) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return value;
}

/** systemd Environment= 值引用。 */
function quoteSystemdValue(value: string): string {
  if (/[\s"\\]/.test(value)) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return value;
}

function resolvePaths(config: SystemdConfig): DaemonPaths {
  return resolveDaemonPaths({
    label: config.unitName,
    stateDir: config.stateDir,
    env: config.env,
  });
}

function resolveUnitName(config: SystemdConfig): string {
  return config.unitName ?? 'cdf-know-daemon';
}

/**
 * 生成 systemd user service 文件内容。
 * 支持 Restart、ExecStart、Environment、WorkingDirectory、StandardOutput/Error。
 */
export function generateSystemdService(config: SystemdConfig): string {
  const paths = resolvePaths(config);
  const stdoutPath = config.stdoutPath ?? paths.stdoutLogPath;
  const stderrPath = config.stderrPath ?? paths.stderrLogPath;
  const description = config.description ?? 'CrossWMS Daemon';

  const lines: string[] = [];
  lines.push('[Unit]');
  lines.push(`Description=${description}`);
  lines.push('After=network.target');
  lines.push('');
  lines.push('[Service]');
  lines.push('Type=simple');
  lines.push(`ExecStart=${config.programArguments.map(quoteSystemdArg).join(' ')}`);
  if (config.workingDirectory) {
    lines.push(`WorkingDirectory=${config.workingDirectory}`);
  }
  lines.push(`Restart=${config.restart === false ? 'no' : 'always'}`);
  if (config.restartDelayMs && config.restartDelayMs > 0) {
    lines.push(`RestartSec=${Math.max(1, Math.floor(config.restartDelayMs / 1000))}`);
  }
  if (config.environment) {
    for (const [k, v] of Object.entries(config.environment)) {
      lines.push(`Environment=${k}=${quoteSystemdValue(v)}`);
    }
  }
  lines.push(`StandardOutput=append:${stdoutPath}`);
  lines.push(`StandardError=append:${stderrPath}`);
  lines.push('');
  lines.push('[Install]');
  lines.push('WantedBy=default.target');
  return `${lines.join('\n')}\n`;
}

/**
 * 安装 systemd user service：写入单元文件，daemon-reload，enable 并 start。
 */
export async function installSystemd(config: SystemdConfig): Promise<{ unitPath: string }> {
  const unitName = resolveUnitName(config);
  const unitFile = `${unitName}.service`;
  const paths = resolvePaths(config);

  await fs.mkdir(path.dirname(paths.systemdUnitPath), { recursive: true });
  await fs.mkdir(paths.logDir, { recursive: true });
  const unit = generateSystemdService(config);
  await fs.writeFile(paths.systemdUnitPath, unit, 'utf8');

  const reload = await execSystemctlUser(['daemon-reload']);
  if (reload.code !== 0) {
    logger.warn(`[systemd] daemon-reload 返回非零退出码: ${reload.stderr || reload.stdout}`);
  }
  const enable = await execSystemctlUser(['enable', unitFile]);
  if (enable.code !== 0) {
    logger.warn(`[systemd] enable 返回非零退出码: ${enable.stderr || enable.stdout}`);
  }
  const start = await execSystemctlUser(['start', unitFile]);
  if (start.code !== 0) {
    logger.warn(`[systemd] start 返回非零退出码: ${start.stderr || start.stdout}`);
  } else {
    logger.info(`[systemd] 已安装并启动 systemd user service: ${paths.systemdUnitPath}`);
  }
  return { unitPath: paths.systemdUnitPath };
}

/** 卸载 systemd user service：disable --now，移除单元文件并 daemon-reload。 */
export async function uninstallSystemd(config: SystemdConfig): Promise<void> {
  const unitName = resolveUnitName(config);
  const unitFile = `${unitName}.service`;
  const paths = resolvePaths(config);

  await execSystemctlUser(['disable', '--now', unitFile]).catch(() => undefined);
  try {
    await fs.unlink(paths.systemdUnitPath);
    logger.info(`[systemd] 已移除 systemd user service: ${paths.systemdUnitPath}`);
  } catch (err) {
    logger.warn(`[systemd] 移除单元文件失败: ${(err as Error).message}`);
  }
  await execSystemctlUser(['daemon-reload']);
}

/** 启动 systemd user service。 */
export async function startSystemd(config: SystemdConfig): Promise<void> {
  const unitFile = `${resolveUnitName(config)}.service`;
  const res = await execSystemctlUser(['start', unitFile]);
  if (res.code !== 0) {
    throw new Error(`systemctl start 失败: ${res.stderr || res.stdout}`);
  }
  logger.info(`[systemd] 已启动 systemd user service: ${unitFile}`);
}

/** 停止 systemd user service。 */
export async function stopSystemd(config: SystemdConfig): Promise<void> {
  const unitFile = `${resolveUnitName(config)}.service`;
  const res = await execSystemctlUser(['stop', unitFile]);
  if (res.code !== 0) {
    throw new Error(`systemctl stop 失败: ${res.stderr || res.stdout}`);
  }
  logger.info(`[systemd] 已停止 systemd user service: ${unitFile}`);
}

/** 查询 systemd user service 状态。 */
export async function getSystemdStatus(config: SystemdConfig): Promise<SystemdStatus> {
  const unitName = resolveUnitName(config);
  const unitFile = `${unitName}.service`;
  const paths = resolvePaths(config);

  let installed = false;
  try {
    await fs.access(paths.systemdUnitPath);
    installed = true;
  } catch {
    installed = false;
  }

  const isEnabled = await execSystemctlUser(['is-enabled', unitFile]);
  const enabled = isEnabled.code === 0;

  const show = await execSystemctlUser([
    'show',
    unitFile,
    '--no-page',
    '--property',
    'ActiveState,SubState,MainPID,ExecMainStatus',
  ]);
  if (show.code !== 0) {
    return {
      installed,
      enabled,
      running: false,
      detail: (show.stderr || show.stdout).trim() || undefined,
    };
  }

  const entries = parseKeyValueOutput(show.stdout, '=');
  const activeState = entries.activestate ?? '';
  const subState = entries.substate ?? '';
  const mainPidRaw = entries.mainpid ?? '';
  const pid = mainPidRaw ? Number.parseInt(mainPidRaw, 10) : undefined;
  const lastExitStatus = entries.execmainstatus
    ? Number.parseInt(entries.execmainstatus, 10)
    : undefined;
  const running = activeState.toLowerCase() === 'active';

  return {
    installed,
    enabled,
    running,
    pid: typeof pid === 'number' && !Number.isNaN(pid) ? pid : undefined,
    state: activeState || undefined,
    subState: subState || undefined,
    lastExitStatus: typeof lastExitStatus === 'number' && !Number.isNaN(lastExitStatus) ? lastExitStatus : undefined,
  };
}

/** 解析 key=value（或 key:value）格式的命令输出。 */
function parseKeyValueOutput(output: string, separator: string): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const idx = line.indexOf(separator);
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + separator.length).trim();
    if (key) entries[key] = value;
  }
  return entries;
}

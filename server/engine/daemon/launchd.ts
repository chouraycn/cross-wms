/**
 * macOS launchd 守护进程管理
 * 生成 launchd plist XML 配置；加载/卸载；启动/停止；状态查询。
 * 参考 openclaw/src/daemon/launchd.ts 的架构对齐实现。
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../../logger.js';
import { resolveDaemonPaths, type DaemonPaths } from './paths.js';

export interface LaunchdConfig {
  /** launchd 标签，默认 com.cdf-know.daemon */
  label?: string;
  /** 启动命令参数（第一项为可执行程序） */
  programArguments: string[];
  /** 工作目录 */
  workingDirectory?: string;
  /** 环境变量 */
  environment?: Record<string, string>;
  /** RunAtLoad，默认 true */
  runAtLoad?: boolean;
  /** KeepAlive，默认 true（异常退出自动重启） */
  keepAlive?: boolean;
  /** StartInterval（毫秒），设置后按间隔周期运行 */
  startIntervalMs?: number;
  /** 标准输出日志路径 */
  stdoutPath?: string;
  /** 标准错误日志路径 */
  stderrPath?: string;
  /** 状态目录覆盖 */
  stateDir?: string;
  /** 环境变量来源（用于解析主目录） */
  env?: Record<string, string | undefined>;
}

export interface LaunchdStatus {
  installed: boolean;
  loaded: boolean;
  running: boolean;
  pid?: number;
  state?: string;
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

/** XML 文本节点转义。 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function resolvePaths(config: LaunchdConfig): DaemonPaths {
  return resolveDaemonPaths({
    label: config.label,
    stateDir: config.stateDir,
    env: config.env,
  });
}

/**
 * 生成 launchd plist XML 配置。
 * 支持 KeepAlive、RunAtLoad、StartInterval、ProgramArguments、
 * WorkingDirectory、EnvironmentVariables、StandardOutPath、StandardErrorPath。
 */
export function generateLaunchdPlist(config: LaunchdConfig): string {
  const label = config.label ?? 'com.cdf-know.daemon';
  const paths = resolvePaths(config);
  const stdoutPath = config.stdoutPath ?? paths.stdoutLogPath;
  const stderrPath = config.stderrPath ?? paths.stderrLogPath;

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">');
  lines.push('<plist version="1.0">');
  lines.push('<dict>');
  lines.push('  <key>Label</key>');
  lines.push(`  <string>${escapeXml(label)}</string>`);
  lines.push('  <key>ProgramArguments</key>');
  lines.push('  <array>');
  for (const arg of config.programArguments) {
    lines.push(`    <string>${escapeXml(arg)}</string>`);
  }
  lines.push('  </array>');
  if (config.workingDirectory) {
    lines.push('  <key>WorkingDirectory</key>');
    lines.push(`  <string>${escapeXml(config.workingDirectory)}</string>`);
  }
  lines.push('  <key>RunAtLoad</key>');
  lines.push(`  <${config.runAtLoad !== false ? 'true' : 'false'} />`);
  lines.push('  <key>KeepAlive</key>');
  lines.push(`  <${config.keepAlive !== false ? 'true' : 'false'} />`);
  if (config.startIntervalMs && config.startIntervalMs > 0) {
    lines.push('  <key>StartInterval</key>');
    lines.push(`  <integer>${Math.floor(config.startIntervalMs / 1000)}</integer>`);
  }
  if (config.environment && Object.keys(config.environment).length > 0) {
    lines.push('  <key>EnvironmentVariables</key>');
    lines.push('  <dict>');
    for (const [k, v] of Object.entries(config.environment)) {
      lines.push(`    <key>${escapeXml(k)}</key>`);
      lines.push(`    <string>${escapeXml(v)}</string>`);
    }
    lines.push('  </dict>');
  }
  lines.push('  <key>StandardOutPath</key>');
  lines.push(`  <string>${escapeXml(stdoutPath)}</string>`);
  lines.push('  <key>StandardErrorPath</key>');
  lines.push(`  <string>${escapeXml(stderrPath)}</string>`);
  lines.push('</dict>');
  lines.push('</plist>');
  return `${lines.join('\n')}\n`;
}

/**
 * 安装 LaunchAgent：写入 plist，并执行 launchctl load。
 * 安装前会先 unload 旧实例，避免重复加载报错。
 */
export async function installLaunchd(config: LaunchdConfig): Promise<{ plistPath: string }> {
  const label = config.label ?? 'com.cdf-know.daemon';
  const paths = resolvePaths(config);
  const plistPath = paths.launchdPlistPath;

  await fs.mkdir(path.dirname(plistPath), { recursive: true });
  await fs.mkdir(paths.logDir, { recursive: true });
  const plist = generateLaunchdPlist({ ...config, label });
  await fs.writeFile(plistPath, plist, 'utf8');

  // 先卸载已加载的旧实例，再加载
  await execCmd('launchctl', ['unload', plistPath]).catch(() => undefined);
  const load = await execCmd('launchctl', ['load', plistPath]);
  if (load.code !== 0) {
    logger.warn(`[launchd] launchctl load 返回非零退出码: ${load.stderr || load.stdout}`);
  } else {
    logger.info(`[launchd] 已安装并加载 LaunchAgent: ${plistPath}`);
  }
  return { plistPath };
}

/** 卸载 LaunchAgent：launchctl unload 并移除 plist 文件。 */
export async function uninstallLaunchd(config: LaunchdConfig): Promise<void> {
  const label = config.label ?? 'com.cdf-know.daemon';
  const paths = resolvePaths(config);
  const plistPath = paths.launchdPlistPath;

  await execCmd('launchctl', ['unload', plistPath]).catch(() => undefined);
  try {
    await fs.unlink(plistPath);
    logger.info(`[launchd] 已移除 LaunchAgent: ${plistPath}`);
  } catch (err) {
    logger.warn(`[launchd] 移除 plist 失败: ${(err as Error).message}`);
  }
}

/** 启动 LaunchAgent（等同于 load；若已加载则尝试 kickstart）。 */
export async function startLaunchd(config: LaunchdConfig): Promise<void> {
  const label = config.label ?? 'com.cdf-know.daemon';
  const paths = resolvePaths(config);
  const plistPath = paths.launchdPlistPath;
  const load = await execCmd('launchctl', ['load', plistPath]);
  if (load.code !== 0) {
    // 已加载时尝试 kickstart
    const kickstart = await execCmd('launchctl', ['kickstart', `gui/${process.getuid?.() ?? 501}/${label}`]);
    if (kickstart.code !== 0) {
      throw new Error(`launchctl load/kickstart 失败: ${load.stderr || kickstart.stderr || load.stdout}`);
    }
  }
  logger.info(`[launchd] 已启动 LaunchAgent: ${label}`);
}

/** 停止 LaunchAgent（launchctl unload）。 */
export async function stopLaunchd(config: LaunchdConfig): Promise<void> {
  const paths = resolvePaths(config);
  const plistPath = paths.launchdPlistPath;
  const unload = await execCmd('launchctl', ['unload', plistPath]);
  if (unload.code !== 0) {
    logger.warn(`[launchd] launchctl unload 返回非零退出码: ${unload.stderr || unload.stdout}`);
  }
  logger.info(`[launchd] 已停止 LaunchAgent: ${config.label ?? 'com.cdf-know.daemon'}`);
}

/** 查询 LaunchAgent 状态：plist 是否存在、是否已加载、是否运行、PID。 */
export async function getLaunchdStatus(config: LaunchdConfig): Promise<LaunchdStatus> {
  const label = config.label ?? 'com.cdf-know.daemon';
  const paths = resolvePaths(config);
  const plistPath = paths.launchdPlistPath;

  let installed = false;
  try {
    await fs.access(plistPath);
    installed = true;
  } catch {
    installed = false;
  }

  const list = await execCmd('launchctl', ['list', label]);
  if (list.code !== 0) {
    return {
      installed,
      loaded: false,
      running: false,
      detail: (list.stderr || list.stdout).trim() || undefined,
    };
  }

  // launchctl list <label> 输出三列：PID Status Label
  const out = list.stdout.trim();
  const parts = out.split(/\s+/);
  const pidRaw = parts[0];
  const statusRaw = parts[1];
  const pid = pidRaw && pidRaw !== '-' ? Number.parseInt(pidRaw, 10) : undefined;
  const lastExitStatus =
    statusRaw && /^-?\d+$/.test(statusRaw) ? Number.parseInt(statusRaw, 10) : undefined;
  const running = typeof pid === 'number' && !Number.isNaN(pid);

  return {
    installed,
    loaded: true,
    running,
    pid: running ? pid : undefined,
    lastExitStatus,
    state: running ? 'running' : 'stopped',
  };
}

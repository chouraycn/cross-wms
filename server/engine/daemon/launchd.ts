/**
 * macOS launchd 守护进程管理
 * 生成 launchd plist XML 配置；加载/卸载；启动/停止；状态查询。
 * 支持 bootstrap/bootout 新式 API、环境变量文件包装、安全目录权限、
 * GUI 会话不可用时的诊断信息。
 * 参考 openclaw/src/daemon/launchd.ts 的架构对齐实现。
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../../logger.js';
import { resolveDaemonPaths, resolveHomeDir, type DaemonPaths } from './paths.js';

const LAUNCH_AGENT_DIR_MODE = 0o755;
const LAUNCH_AGENT_PLIST_MODE = 0o600;
const LAUNCH_AGENT_PRIVATE_DIR_MODE = 0o700;
const LAUNCH_AGENT_ENV_FILE_MODE = 0o600;
const LAUNCH_AGENT_ENV_WRAPPER_MODE = 0o700;
const ENV_DIR_NAME = 'service-env';

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
  /** plist 注释/描述 */
  comment?: string;
  /** 是否将环境变量写入独立文件（安全隔离），默认 true */
  useEnvFile?: boolean;
}

export interface LaunchdStatus {
  installed: boolean;
  loaded: boolean;
  running: boolean;
  pid?: number;
  state?: string;
  lastExitStatus?: number;
  lastExitReason?: string;
  missingGuiSession?: boolean;
  detail?: string;
}

export interface LaunchdBootstrapRepairResult {
  ok: boolean;
  status: 'repaired' | 'already-loaded' | 'bootstrap-failed' | 'kickstart-failed' | 'gui-session-unavailable';
  detail?: string;
  domain?: string;
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

async function execLaunchctl(
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number }> {
  return execCmd('launchctl', args);
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

function resolveGuiDomain(): string {
  if (typeof process.getuid !== 'function') {
    return 'gui/501';
  }
  return `gui/${process.getuid()}`;
}

function isUnsupportedGuiDomain(detail: string): boolean {
  const normalized = detail.toLowerCase();
  return (
    normalized.includes('domain does not support specified action') ||
    normalized.includes('could not find domain for user gui') ||
    normalized.includes('bootstrap failed: 125')
  );
}

function isLaunchctlAlreadyLoaded(res: { stdout: string; stderr: string; code: number }): boolean {
  const detail = (res.stderr || res.stdout).toLowerCase();
  return res.code === 130 || detail.includes('already exists in domain');
}

function isLaunchctlNotLoaded(res: { stdout: string; stderr: string; code: number }): boolean {
  const detail = (res.stderr || res.stdout).toLowerCase();
  return (
    detail.includes('no such process') ||
    detail.includes('could not find service') ||
    detail.includes('not found')
  );
}

function isLaunchctlOperationAlreadyInProgress(detail: string): boolean {
  const normalized = detail.toLowerCase();
  return (
    normalized.includes('operation already in progress') ||
    normalized.includes('bootstrap failed: 37')
  );
}

/** 格式化 GUI 会话不可用错误（参考 openclaw formatLaunchAgentGuiSessionError）。 */
export function formatLaunchAgentGuiSessionError(params: {
  detail: string;
  domain: string;
  actionHint: string;
}): string {
  return [
    `launchctl bootstrap failed: ${params.detail}`,
    `LaunchAgent ${params.actionHint} requires a logged-in macOS GUI session for this user (${params.domain}).`,
    'This usually means you are running from SSH/headless context or as the wrong user (including sudo).',
    `Fix: sign in to the macOS desktop as the target user and rerun \`${params.actionHint}\`.`,
    'For headless VM setups, enable auto-login for the target user so macOS creates the GUI session after boot.',
  ].join('\n');
}

// --- 安全目录 ---

async function ensureSecureDirectory(
  targetPath: string,
  dirMode = LAUNCH_AGENT_DIR_MODE,
): Promise<void> {
  await fs.mkdir(targetPath, { recursive: true, mode: dirMode });
  try {
    const stat = await fs.stat(targetPath);
    const mode = stat.mode & 0o777;
    const forbiddenMode = dirMode === LAUNCH_AGENT_PRIVATE_DIR_MODE ? 0o077 : 0o022;
    const tightenedMode = mode & ~forbiddenMode;
    if (tightenedMode !== mode) {
      await fs.chmod(targetPath, tightenedMode);
    }
  } catch {
    // Best effort
  }
}

// --- 环境变量文件包装（参考 openclaw prepareLaunchAgentProgramArguments） ---

function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function collectEnvironmentEntries(
  environment: Record<string, string> | undefined,
): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  for (const [rawKey, rawValue] of Object.entries(environment ?? {})) {
    const key = rawKey.trim();
    const value = rawValue?.trim();
    if (!key || !value) continue;
    entries.push([key, value]);
  }
  return entries.toSorted(([left], [right]) => left.localeCompare(right));
}

function buildEnvironmentFile(entries: Array<[string, string]>): string {
  return [
    '# Generated by cross-wms. Do not edit while the daemon service is installed.',
    ...entries.map(([key, value]) => `export ${key}=${shellSingleQuote(value)}`),
    '',
  ].join('\n');
}

function buildEnvironmentWrapper(): string {
  return `#!/bin/sh
set -eu
env_file="$1"
shift
if [ -f "$env_file" ]; then
  . "$env_file"
fi
exec "$@"
`;
}

function resolveEnvDir(paths: DaemonPaths): string {
  return paths.envDir;
}

function resolveEnvFilePath(paths: DaemonPaths, label: string): string {
  return path.join(resolveEnvDir(paths), `${label}.env`);
}

function resolveEnvWrapperPath(paths: DaemonPaths, label: string): string {
  return path.join(resolveEnvDir(paths), `${label}-env-wrapper.sh`);
}

async function prepareProgramArgumentsWithEnvFile(params: {
  paths: DaemonPaths;
  label: string;
  programArguments: string[];
  environment: Record<string, string> | undefined;
}): Promise<{ programArguments: string[]; inlineEnvironment?: Record<string, string> }> {
  const entries = collectEnvironmentEntries(params.environment);
  if (entries.length === 0) {
    return { programArguments: params.programArguments };
  }

  const envDir = resolveEnvDir(params.paths);
  const envFilePath = resolveEnvFilePath(params.paths, params.label);
  const wrapperPath = resolveEnvWrapperPath(params.paths, params.label);

  await ensureSecureDirectory(envDir, LAUNCH_AGENT_PRIVATE_DIR_MODE);
  await fs.writeFile(envFilePath, buildEnvironmentFile(entries), {
    encoding: 'utf8',
    mode: LAUNCH_AGENT_ENV_FILE_MODE,
  });
  await fs.chmod(envFilePath, LAUNCH_AGENT_ENV_FILE_MODE).catch(() => undefined);

  await fs.writeFile(wrapperPath, buildEnvironmentWrapper(), {
    encoding: 'utf8',
    mode: LAUNCH_AGENT_ENV_WRAPPER_MODE,
  });
  await fs.chmod(wrapperPath, LAUNCH_AGENT_ENV_WRAPPER_MODE).catch(() => undefined);

  // 检查是否已经是 wrapper 调用
  if (
    params.programArguments[0] === wrapperPath &&
    params.programArguments[1] === envFilePath
  ) {
    return { programArguments: params.programArguments };
  }

  return {
    programArguments: [wrapperPath, envFilePath, ...params.programArguments],
  };
}

// --- plist 生成 ---

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
  if (config.comment) {
    lines.push('  <key>Comment</key>');
    lines.push(`  <string>${escapeXml(config.comment)}</string>`);
  }
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

// --- lifecycle ---

async function bootstrapLaunchAgentOrThrow(params: {
  domain: string;
  serviceTarget: string;
  plistPath: string;
  actionHint: string;
}): Promise<void> {
  // 清除可能残留的 disable 状态
  await execLaunchctl(['enable', params.serviceTarget]);
  const boot = await execLaunchctl(['bootstrap', params.domain, params.plistPath]);
  if (boot.code === 0) return;

  const detail = (boot.stderr || boot.stdout).trim();
  if (isUnsupportedGuiDomain(detail)) {
    throw new Error(formatLaunchAgentGuiSessionError({
      detail,
      domain: params.domain,
      actionHint: params.actionHint,
    }));
  }
  if (isLaunchctlOperationAlreadyInProgress(detail)) {
    // 操作正在进行中，尝试探测状态
    const probe = await execLaunchctl(['print', params.serviceTarget]);
    if (probe.code === 0) return;
  }
  if (isLaunchctlAlreadyLoaded(boot)) return;
  throw new Error(`launchctl bootstrap failed: ${detail}`);
}

/**
 * 安装 LaunchAgent：写入 plist（含可选 env 文件），并执行 launchctl bootstrap。
 * 安装前会先 bootout 旧实例，避免重复加载报错。
 */
export async function installLaunchd(config: LaunchdConfig): Promise<{ plistPath: string }> {
  const label = config.label ?? 'com.cdf-know.daemon';
  const paths = resolvePaths(config);
  const plistPath = paths.launchdPlistPath;
  const domain = resolveGuiDomain();
  const serviceTarget = `${domain}/${label}`;

  await ensureSecureDirectory(path.dirname(plistPath));
  await ensureSecureDirectory(paths.logDir);

  const useEnvFile = config.useEnvFile !== false;
  let plistConfig = { ...config, label };

  if (useEnvFile && config.environment && Object.keys(config.environment).length > 0) {
    const prepared = await prepareProgramArgumentsWithEnvFile({
      paths,
      label,
      programArguments: config.programArguments,
      environment: config.environment,
    });
    plistConfig = {
      ...plistConfig,
      programArguments: prepared.programArguments,
      environment: prepared.inlineEnvironment,
    };
  }

  const plist = generateLaunchdPlist(plistConfig);
  await fs.writeFile(plistPath, plist, { encoding: 'utf8', mode: LAUNCH_AGENT_PLIST_MODE });
  await fs.chmod(plistPath, LAUNCH_AGENT_PLIST_MODE).catch(() => undefined);

  // 先卸载已加载的旧实例
  await execLaunchctl(['bootout', domain, plistPath]).catch(() => undefined);
  await execLaunchctl(['unload', plistPath]).catch(() => undefined);

  // 使用 bootstrap 加载
  try {
    await bootstrapLaunchAgentOrThrow({
      domain,
      serviceTarget,
      plistPath,
      actionHint: 'cdf-know daemon install',
    });
    logger.info(`[launchd] 已安装并加载 LaunchAgent: ${plistPath}`);
  } catch (err) {
    // 回退到 load
    const load = await execLaunchctl(['load', plistPath]);
    if (load.code !== 0) {
      logger.warn(`[launchd] launchctl bootstrap/load 均返回非零退出码: ${(err as Error).message}`);
    } else {
      logger.info(`[launchd] 已安装并加载 LaunchAgent (fallback load): ${plistPath}`);
    }
  }
  return { plistPath };
}

/** 卸载 LaunchAgent：bootout + unload 并移除 plist 文件到废纸篓。 */
export async function uninstallLaunchd(config: LaunchdConfig): Promise<void> {
  const label = config.label ?? 'com.cdf-know.daemon';
  const paths = resolvePaths(config);
  const plistPath = paths.launchdPlistPath;
  const domain = resolveGuiDomain();

  await execLaunchctl(['bootout', domain, plistPath]).catch(() => undefined);
  await execLaunchctl(['unload', plistPath]).catch(() => undefined);

  try {
    await fs.access(plistPath);
  } catch {
    logger.info(`[launchd] LaunchAgent plist 不存在: ${plistPath}`);
    return;
  }

  // 尝试移到废纸篓而非直接删除
  try {
    const home = resolveHomeDir(config.env);
    const trashDir = path.join(home, '.Trash');
    const dest = path.join(trashDir, `${label}.plist`);
    await fs.mkdir(trashDir, { recursive: true });
    await fs.rename(plistPath, dest);
    logger.info(`[launchd] 已移 LaunchAgent 到废纸篓: ${dest}`);
  } catch {
    try {
      await fs.unlink(plistPath);
      logger.info(`[launchd] 已移除 LaunchAgent: ${plistPath}`);
    } catch (err) {
      logger.warn(`[launchd] 移除 plist 失败: ${(err as Error).message}`);
    }
  }
}

/** 启动 LaunchAgent（bootstrap；若已加载则尝试 kickstart）。 */
export async function startLaunchd(config: LaunchdConfig): Promise<void> {
  const label = config.label ?? 'com.cdf-know.daemon';
  const paths = resolvePaths(config);
  const plistPath = paths.launchdPlistPath;
  const domain = resolveGuiDomain();
  const serviceTarget = `${domain}/${label}`;

  try {
    await bootstrapLaunchAgentOrThrow({
      domain,
      serviceTarget,
      plistPath,
      actionHint: 'cdf-know daemon start',
    });
    logger.info(`[launchd] 已启动 LaunchAgent: ${label}`);
  } catch {
    // 已加载时尝试 kickstart
    const kickstart = await execLaunchctl(['kickstart', serviceTarget]);
    if (kickstart.code !== 0) {
      // 回退到 load
      const load = await execLaunchctl(['load', plistPath]);
      if (load.code !== 0) {
        throw new Error(`launchctl bootstrap/kickstart/load 均失败: ${kickstart.stderr || load.stderr || kickstart.stdout}`);
      }
    }
    logger.info(`[launchd] 已启动 LaunchAgent (kickstart): ${label}`);
  }
}

/** 停止 LaunchAgent（bootout，可选 --disable 持久禁用）。 */
export async function stopLaunchd(config: LaunchdConfig & { disable?: boolean }): Promise<void> {
  const label = config.label ?? 'com.cdf-know.daemon';
  const paths = resolvePaths(config);
  const domain = resolveGuiDomain();
  const serviceTarget = `${domain}/${label}`;

  if (config.disable) {
    // 持久禁用：先 disable 再 stop
    const disableResult = await execLaunchctl(['disable', serviceTarget]);
    if (disableResult.code !== 0) {
      logger.warn(`[launchd] launchctl disable 返回非零: ${disableResult.stderr || disableResult.stdout}`);
    }
    const stop = await execLaunchctl(['stop', label]);
    if (stop.code !== 0 && !isLaunchctlNotLoaded(stop)) {
      // 回退到 bootout
      await execLaunchctl(['bootout', serviceTarget]).catch(() => undefined);
    }
  } else {
    // 默认：仅 bootout，不持久化 disable 状态
    const bootout = await execLaunchctl(['bootout', serviceTarget]);
    if (bootout.code !== 0 && !isLaunchctlNotLoaded(bootout)) {
      logger.warn(`[launchd] launchctl bootout 返回非零退出码: ${bootout.stderr || bootout.stdout}`);
    }
  }
  logger.info(`[launchd] 已停止 LaunchAgent: ${label}`);
}

// --- 状态查询 ---

/** 解析 launchctl print 的键值输出。 */
function parseLaunchctlPrint(output: string): {
  state?: string;
  pid?: number;
  lastExitStatus?: number;
  lastExitReason?: string;
} {
  const info: Record<string, string> = {};
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key && value) info[key] = value;
  }
  const result: ReturnType<typeof parseLaunchctlPrint> = {};
  if (info.state) result.state = info.state;
  if (info.pid) {
    const pid = Number.parseInt(info.pid, 10);
    if (Number.isFinite(pid) && pid > 0) result.pid = pid;
  }
  if (info['last exit status']) {
    const status = Number.parseInt(info['last exit status'], 10);
    if (Number.isFinite(status)) result.lastExitStatus = status;
  }
  if (info['last exit reason']) result.lastExitReason = info['last exit reason'];
  return result;
}

/** 查询 LaunchAgent 状态：plist 是否存在、是否已加载、是否运行、PID。 */
export async function getLaunchdStatus(config: LaunchdConfig): Promise<LaunchdStatus> {
  const label = config.label ?? 'com.cdf-know.daemon';
  const paths = resolvePaths(config);
  const plistPath = paths.launchdPlistPath;
  const domain = resolveGuiDomain();
  const serviceTarget = `${domain}/${label}`;

  let installed = false;
  try {
    await fs.access(plistPath);
    installed = true;
  } catch {
    installed = false;
  }

  // 优先使用 launchctl print（新式 API）
  const printRes = await execLaunchctl(['print', serviceTarget]);
  if (printRes.code === 0) {
    const parsed = parseLaunchctlPrint(printRes.stdout || printRes.stderr || '');
    const state = parsed.state?.toLowerCase();
    const running = state === 'running' || (typeof parsed.pid === 'number' && parsed.pid > 1);
    return {
      installed,
      loaded: true,
      running,
      pid: running ? parsed.pid : undefined,
      lastExitStatus: parsed.lastExitStatus,
      lastExitReason: parsed.lastExitReason,
      state: running ? 'running' : (state ?? 'stopped'),
    };
  }

  const printDetail = (printRes.stderr || printRes.stdout).trim();
  if (isUnsupportedGuiDomain(printDetail)) {
    return {
      installed,
      loaded: installed,
      running: false,
      missingGuiSession: true,
      detail: 'GUI 会话不可用（可能处于 SSH/headless 环境）',
    };
  }

  // 回退到 launchctl list（旧式 API）
  const list = await execLaunchctl(['list', label]);
  if (list.code !== 0) {
    return {
      installed,
      loaded: false,
      running: false,
      detail: (list.stderr || list.stdout).trim() || undefined,
    };
  }

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

/**
 * 修复 LaunchAgent bootstrap 状态（参考 openclaw repairLaunchAgentBootstrap）。
 * 用于服务已安装但未正确加载的场景。
 */
export async function repairLaunchdBootstrap(config: LaunchdConfig): Promise<LaunchdBootstrapRepairResult> {
  const env = config.env ?? process.env as Record<string, string | undefined>;
  const label = config.label ?? 'com.cdf-know.daemon';
  const paths = resolvePaths(config);
  const plistPath = paths.launchdPlistPath;
  const domain = resolveGuiDomain();
  const serviceTarget = `${domain}/${label}`;

  await execLaunchctl(['enable', serviceTarget]);
  const boot = await execLaunchctl(['bootstrap', domain, plistPath]);

  if (boot.code !== 0) {
    const detail = (boot.stderr || boot.stdout).trim();
    if (isUnsupportedGuiDomain(detail)) {
      return { ok: false, status: 'gui-session-unavailable', detail, domain };
    }
    if (isLaunchctlAlreadyLoaded(boot)) {
      // 已加载但可能未运行，尝试 kickstart
      const runtime = await getLaunchdStatus(config);
      if (runtime.running) {
        return { ok: true, status: 'already-loaded' };
      }
      const kick = await execLaunchctl(['kickstart', serviceTarget]);
      if (kick.code !== 0) {
        return { ok: false, status: 'kickstart-failed', detail: (kick.stderr || kick.stdout).trim() || undefined };
      }
      return { ok: true, status: 'already-loaded' };
    }
    return { ok: false, status: 'bootstrap-failed', detail: detail || undefined };
  }

  return { ok: true, status: 'repaired' };
}

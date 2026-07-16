/**
 * Linux systemd 守护进程管理
 * 生成 systemd user service 文件；启用/禁用；启动/停止；状态查询。
 * 支持 sudo 环境下的 machine-user scope 回退、D-Bus 会话自动检测、
 * 单元文件备份与 EnvironmentFile 生成。
 * 参考 openclaw/src/daemon/systemd.ts 的架构对齐实现。
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { logger } from '../../logger.js';
import { resolveDaemonPaths, resolveHomeDir, type DaemonPaths } from './paths.js';

const SYSTEMD_DAEMON_ENV_FILENAME = 'daemon.systemd.env';

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
  /** 是否将环境变量写入 EnvironmentFile 而非内联，默认 true */
  useEnvFile?: boolean;
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
  execEnv?: NodeJS.ProcessEnv,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { encoding: 'utf8', windowsHide: true, maxBuffer: 10 * 1024 * 1024, env: execEnv },
      (err, stdout, stderr) => {
        const code = err ? (typeof err.code === 'number' ? err.code : 1) : 0;
        resolve({ stdout: stdout ?? '', stderr: stderr ?? '', code });
      },
    );
  });
}

// --- systemctl 进程环境与 user scope 解析（参考 openclaw） ---

function readSystemctlEnvUser(env: Record<string, string | undefined>): string | null {
  return env.USER?.trim() || env.LOGNAME?.trim() || null;
}

function readSystemctlEffectiveUser(): string | null {
  try {
    return os.userInfo().username;
  } catch {
    return null;
  }
}

function readSystemctlEffectiveUid(): number | null {
  if (typeof process.geteuid !== 'function') return null;
  try {
    return process.geteuid();
  } catch {
    return null;
  }
}

function isNonRootUser(user: string | null): user is string {
  return Boolean(user && user !== 'root');
}

function hasRootUserManagerEnvironment(env: Record<string, string | undefined>): boolean {
  const home = env.HOME?.trim();
  const runtimeDir = env.XDG_RUNTIME_DIR?.trim();
  const dbusAddress = env.DBUS_SESSION_BUS_ADDRESS?.trim();
  return (
    home === '/root' &&
    runtimeDir === '/run/user/0' &&
    Boolean(dbusAddress?.includes('/run/user/0/bus'))
  );
}

function resolveSystemctlUserScope(env: Record<string, string | undefined>): {
  machineUser: string | null;
  preferMachineScope: boolean;
} {
  const sudoUser = env.SUDO_USER?.trim() || null;
  const envUser = readSystemctlEnvUser(env);
  const effectiveUid = readSystemctlEffectiveUid();
  const effectiveUser = readSystemctlEffectiveUser();
  const isEffectiveRoot = effectiveUid === null ? effectiveUser === 'root' : effectiveUid === 0;
  const hasRootUserManager = isEffectiveRoot && hasRootUserManagerEnvironment(env);
  const isSudoToRoot = isEffectiveRoot && !hasRootUserManager && isNonRootUser(sudoUser);
  const machineUser = hasRootUserManager
    ? null
    : isSudoToRoot
      ? sudoUser
      : isNonRootUser(envUser)
        ? envUser
        : isNonRootUser(sudoUser)
          ? sudoUser
          : effectiveUser || envUser || sudoUser || null;
  return {
    machineUser,
    preferMachineScope: isSudoToRoot,
  };
}

function resolveSystemctlProcessEnv(env: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const processEnv = { ...process.env, ...env };
  if (processEnv.XDG_RUNTIME_DIR?.trim() && processEnv.DBUS_SESSION_BUS_ADDRESS?.trim()) {
    return processEnv;
  }
  const uid = readSystemctlEffectiveUid();
  if (uid === null || uid === 0) return processEnv;
  const runtimeDir = processEnv.XDG_RUNTIME_DIR?.trim() || `/run/user/${uid}`;
  const busPath = path.posix.join(runtimeDir, 'bus');
  try {
    statSync(busPath); // sync check for bus socket existence
  } catch {
    return processEnv;
  }
  return {
    ...processEnv,
    XDG_RUNTIME_DIR: runtimeDir,
    DBUS_SESSION_BUS_ADDRESS: processEnv.DBUS_SESSION_BUS_ADDRESS?.trim() || `unix:path=${busPath}`,
  };
}

function isSystemdUserBusUnavailable(detail: string): boolean {
  const normalized = detail.toLowerCase();
  return (
    normalized.includes('failed to connect to bus') ||
    normalized.includes('could not connect to d-bus') ||
    normalized.includes('no d-bus') ||
    normalized.includes('not found') ||
    normalized.includes('failed to get d-bus connection')
  );
}

function shouldFallbackToMachineUserScope(detail: string): boolean {
  if (!isSystemdUserBusUnavailable(detail)) return false;
  return !detail.toLowerCase().includes('permission denied');
}

function resolveSystemctlMachineUserScopeArgs(user: string): string[] {
  const trimmedUser = user.trim();
  if (!trimmedUser) return [];
  return ['--machine', `${trimmedUser}@`, '--user'];
}

async function execSystemctl(
  args: string[],
  env?: Record<string, string | undefined>,
): Promise<{ stdout: string; stderr: string; code: number }> {
  const execEnv = env ? resolveSystemctlProcessEnv(env) : undefined;
  return execCmd('systemctl', args, execEnv);
}

async function execSystemctlUser(
  env: Record<string, string | undefined>,
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number }> {
  const { machineUser, preferMachineScope } = resolveSystemctlUserScope(env);

  // Under sudo-to-root, prefer the invoking non-root user's scope directly.
  if (preferMachineScope && machineUser) {
    const machineScopeArgs = resolveSystemctlMachineUserScopeArgs(machineUser);
    if (machineScopeArgs.length > 0) {
      return await execSystemctl([...machineScopeArgs, ...args], env);
    }
  }

  const directResult = await execSystemctl(['--user', ...args], env);
  if (directResult.code === 0) return directResult;

  const detail = `${directResult.stderr} ${directResult.stdout}`.trim();
  if (!machineUser || !shouldFallbackToMachineUserScope(detail)) return directResult;

  const machineScopeArgs = resolveSystemctlMachineUserScopeArgs(machineUser);
  if (machineScopeArgs.length === 0) return directResult;
  return await execSystemctl([...machineScopeArgs, ...args], env);
}

// --- systemd unit 文件生成 ---

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

function resolveSystemdEnvFilePath(paths: DaemonPaths): string {
  return path.join(paths.stateDir, SYSTEMD_DAEMON_ENV_FILENAME);
}

/**
 * 生成 systemd user service 文件内容。
 * 支持 Restart、ExecStart、Environment/EnvironmentFile、WorkingDirectory、StandardOutput/Error。
 */
export function generateSystemdService(config: SystemdConfig, opts?: { envFilePath?: string }): string {
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
  if (opts?.envFilePath) {
    lines.push(`EnvironmentFile=-${opts.envFilePath}`);
  } else if (config.environment) {
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

/** 生成 systemd EnvironmentFile 内容。 */
function generateSystemdEnvFile(environment: Record<string, string>): string {
  return Object.entries(environment)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n') + '\n';
}

// --- lifecycle ---

/**
 * 安装 systemd user service：写入单元文件（含可选 EnvironmentFile），daemon-reload，enable 并 start。
 */
export async function installSystemd(config: SystemdConfig): Promise<{ unitPath: string }> {
  const unitName = resolveUnitName(config);
  const unitFile = `${unitName}.service`;
  const paths = resolvePaths(config);

  await fs.mkdir(path.dirname(paths.systemdUnitPath), { recursive: true });
  await fs.mkdir(paths.logDir, { recursive: true });

  // 备份已有单元文件
  try {
    const existing = await fs.readFile(paths.systemdUnitPath, 'utf8');
    await fs.writeFile(`${paths.systemdUnitPath}.bak`, existing, 'utf8');
  } catch {
    // 不存在则无需备份
  }

  const useEnvFile = config.useEnvFile !== false;
  let envFilePath: string | undefined;

  if (useEnvFile && config.environment && Object.keys(config.environment).length > 0) {
    envFilePath = resolveSystemdEnvFilePath(paths);
    await fs.mkdir(paths.stateDir, { recursive: true });
    await fs.writeFile(envFilePath, generateSystemdEnvFile(config.environment), {
      encoding: 'utf8',
      mode: 0o600,
    });
    await fs.chmod(envFilePath, 0o600).catch(() => undefined);
  }

  const unit = generateSystemdService(config, { envFilePath });
  await fs.writeFile(paths.systemdUnitPath, unit, 'utf8');

  const env = config.env ?? process.env as Record<string, string | undefined>;
  const reload = await execSystemctlUser(env, ['daemon-reload']);
  if (reload.code !== 0) {
    logger.warn(`[systemd] daemon-reload 返回非零退出码: ${reload.stderr || reload.stdout}`);
  }
  const enable = await execSystemctlUser(env, ['enable', unitFile]);
  if (enable.code !== 0) {
    logger.warn(`[systemd] enable 返回非零退出码: ${enable.stderr || enable.stdout}`);
  }
  const start = await execSystemctlUser(env, ['start', unitFile]);
  if (start.code !== 0) {
    logger.warn(`[systemd] start 返回非零退出码: ${start.stderr || start.stdout}`);
  } else {
    logger.info(`[systemd] 已安装并启动 systemd user service: ${paths.systemdUnitPath}`);
  }
  return { unitPath: paths.systemdUnitPath };
}

/** 卸载 systemd user service：disable --now，移除单元文件、环境文件并 daemon-reload。 */
export async function uninstallSystemd(config: SystemdConfig): Promise<void> {
  const unitName = resolveUnitName(config);
  const unitFile = `${unitName}.service`;
  const paths = resolvePaths(config);
  const env = config.env ?? process.env as Record<string, string | undefined>;

  await execSystemctlUser(env, ['disable', '--now', unitFile]).catch(() => undefined);

  // 移除单元文件
  try {
    await fs.unlink(paths.systemdUnitPath);
    logger.info(`[systemd] 已移除 systemd user service: ${paths.systemdUnitPath}`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn(`[systemd] 移除单元文件失败: ${(err as Error).message}`);
    }
  }

  // 移除环境文件
  const envFilePath = resolveSystemdEnvFilePath(paths);
  await fs.unlink(envFilePath).catch(() => undefined);

  await execSystemctlUser(env, ['daemon-reload']).catch(() => undefined);
}

/** 启动 systemd user service。 */
export async function startSystemd(config: SystemdConfig): Promise<void> {
  const unitFile = `${resolveUnitName(config)}.service`;
  const env = config.env ?? process.env as Record<string, string | undefined>;
  const res = await execSystemctlUser(env, ['start', unitFile]);
  if (res.code !== 0) {
    throw new Error(`systemctl start 失败: ${res.stderr || res.stdout}`);
  }
  logger.info(`[systemd] 已启动 systemd user service: ${unitFile}`);
}

/** 停止 systemd user service。 */
export async function stopSystemd(config: SystemdConfig): Promise<void> {
  const unitFile = `${resolveUnitName(config)}.service`;
  const env = config.env ?? process.env as Record<string, string | undefined>;
  const res = await execSystemctlUser(env, ['stop', unitFile]);
  if (res.code !== 0) {
    throw new Error(`systemctl stop 失败: ${res.stderr || res.stdout}`);
  }
  logger.info(`[systemd] 已停止 systemd user service: ${unitFile}`);
}

/** 重启 systemd user service。 */
export async function restartSystemd(config: SystemdConfig): Promise<void> {
  const unitFile = `${resolveUnitName(config)}.service`;
  const env = config.env ?? process.env as Record<string, string | undefined>;
  const res = await execSystemctlUser(env, ['restart', unitFile]);
  if (res.code !== 0) {
    throw new Error(`systemctl restart 失败: ${res.stderr || res.stdout}`);
  }
  logger.info(`[systemd] 已重启 systemd user service: ${unitFile}`);
}

// --- 状态查询 ---

/** 查询 systemd user service 状态。 */
export async function getSystemdStatus(config: SystemdConfig): Promise<SystemdStatus> {
  const unitName = resolveUnitName(config);
  const unitFile = `${unitName}.service`;
  const paths = resolvePaths(config);
  const env = config.env ?? process.env as Record<string, string | undefined>;

  let installed = false;
  try {
    await fs.access(paths.systemdUnitPath);
    installed = true;
  } catch {
    installed = false;
  }

  const isEnabled = await execSystemctlUser(env, ['is-enabled', unitFile]);
  const enabled = isEnabled.code === 0;

  const show = await execSystemctlUser(env, [
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

/**
 * 守护进程路径解析
 * 解析各平台守护进程配置文件路径、日志文件路径、PID 文件路径。
 * 参考 openclaw/src/daemon/paths.ts 的架构对齐实现。
 */
import path from 'node:path';

const DEFAULT_LAUNCHD_LABEL = 'com.cdf-know.daemon';
const DEFAULT_SYSTEMD_UNIT = 'cdf-know-daemon';
const DEFAULT_SCHTASKS_NAME = 'CrossWMSDaemon';
const DEFAULT_STATE_DIR_NAME = '.cdf-know';

const windowsAbsolutePath = /^[a-zA-Z]:[\\/]/;
const windowsUncPath = /^\\\\/;

/** 守护进程相关的全部路径。 */
export interface DaemonPaths {
  /** 用户主目录 */
  homeDir: string;
  /** 状态目录（~/.cdf-know） */
  stateDir: string;
  /** 日志目录 */
  logDir: string;
  /** 标准输出日志路径 */
  stdoutLogPath: string;
  /** 标准错误日志路径 */
  stderrLogPath: string;
  /** PID 文件路径 */
  pidFilePath: string;
  /** 心跳文件路径（用于健康检查） */
  heartbeatFilePath: string;
  /** launchd 标签 */
  launchdLabel: string;
  /** launchd plist 文件路径（~/Library/LaunchAgents/com.cdf-know.daemon.plist） */
  launchdPlistPath: string;
  /** systemd 单元名称（不含 .service 后缀） */
  systemdUnitName: string;
  /** systemd 单元文件路径（~/.config/systemd/user/cdf-know-daemon.service） */
  systemdUnitPath: string;
  /** schtasks 任务名称 */
  schtasksTaskName: string;
  /** Windows 任务脚本路径（.cmd 包装器） */
  taskScriptPath: string;
  /** 环境变量目录（launchd env wrapper） */
  envDir: string;
}

export interface ResolveDaemonPathsOptions {
  env?: Record<string, string | undefined>;
  stateDir?: string;
  /** 通用标签（同时覆盖三个平台默认名） */
  label?: string;
  launchdLabel?: string;
  systemdUnitName?: string;
  schtasksTaskName?: string;
  logDir?: string;
}

/** 解析用户主目录，缺失时抛错。支持 HOME 和 USERPROFILE（Windows）。 */
export function resolveHomeDir(env: Record<string, string | undefined> = process.env): string {
  const home = (env.HOME ?? env.USERPROFILE ?? '').trim();
  if (!home) {
    throw new Error('无法解析用户主目录：HOME/USERPROFILE 未设置');
  }
  return home;
}

/** 将 ~ 展开为用户主目录，同时保留 Windows 绝对/UNC 路径不做 path.resolve 腐蚀。 */
function resolveUserPathWithHome(input: string, home?: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith('~')) {
    if (!home) throw new Error('Missing HOME');
    const expanded = trimmed.replace(/^~(?=$|[\\/])/, home);
    return path.resolve(expanded);
  }
  if (windowsAbsolutePath.test(trimmed) || windowsUncPath.test(trimmed)) {
    return trimmed;
  }
  return path.resolve(trimmed);
}

/**
 * 解析守护进程状态目录。
 * 支持 CDF_STATE_DIR 环境变量覆盖，以及 ~ 展开和 profile 后缀隔离。
 */
export function resolveDaemonStateDir(env: Record<string, string | undefined>): string {
  const override = (env.CDF_STATE_DIR ?? '').trim();
  if (override) {
    const home = override.startsWith('~') ? resolveHomeDir(env) : undefined;
    return resolveUserPathWithHome(override, home);
  }
  const home = resolveHomeDir(env);
  const suffix = resolveProfileSuffix(env.CDF_PROFILE);
  return path.join(home, `${DEFAULT_STATE_DIR_NAME}${suffix}`);
}

/** Profile 后缀隔离，允许多实例并存。 */
function resolveProfileSuffix(profile: string | undefined): string {
  const trimmed = (profile ?? '').trim();
  if (!trimmed) return '';
  return `-${trimmed}`;
}

/**
 * 解析守护进程任务脚本路径。
 * 支持 CDF_TASK_SCRIPT / CDF_TASK_SCRIPT_NAME 环境变量覆盖。
 */
export function resolveDaemonTaskScriptPath(env: Record<string, string | undefined>): string {
  const override = (env.CDF_TASK_SCRIPT ?? '').trim();
  if (override) return override;
  const scriptName = (env.CDF_TASK_SCRIPT_NAME ?? '').trim() || 'daemon.cmd';
  if (/[/\\]|\.\./.test(scriptName)) {
    throw new Error(`CDF_TASK_SCRIPT_NAME must be a file name only, not a path: ${scriptName}`);
  }
  return path.join(resolveDaemonStateDir(env), scriptName);
}

/**
 * 解析守护进程在各平台使用的路径。
 * 平台特有路径即使当前平台不适用也会一并返回，便于跨平台渲染与状态展示。
 */
export function resolveDaemonPaths(options: ResolveDaemonPathsOptions = {}): DaemonPaths {
  const env = options.env ?? process.env;
  const homeDir = resolveHomeDir(env);
  const stateDir = options.stateDir ?? resolveDaemonStateDir(env);
  const logDir = options.logDir ?? path.join(stateDir, 'logs');
  const stdoutLogPath = path.join(logDir, 'daemon.stdout.log');
  const stderrLogPath = path.join(logDir, 'daemon.stderr.log');
  const pidFilePath = path.join(stateDir, 'daemon.pid');
  const heartbeatFilePath = path.join(stateDir, 'daemon.heartbeat');
  const envDir = path.join(stateDir, 'service-env');

  const launchdLabel = options.launchdLabel ?? options.label ?? DEFAULT_LAUNCHD_LABEL;
  const systemdUnitName = options.systemdUnitName ?? options.label ?? DEFAULT_SYSTEMD_UNIT;
  const schtasksTaskName = options.schtasksTaskName ?? options.label ?? DEFAULT_SCHTASKS_NAME;

  const launchdPlistPath = path.join(homeDir, 'Library', 'LaunchAgents', `${launchdLabel}.plist`);
  const systemdUnitPath = path.join(
    homeDir,
    '.config',
    'systemd',
    'user',
    `${systemdUnitName}.service`,
  );
  const taskScriptPath = resolveDaemonTaskScriptPath(env);

  return {
    homeDir,
    stateDir,
    logDir,
    stdoutLogPath,
    stderrLogPath,
    pidFilePath,
    heartbeatFilePath,
    launchdLabel,
    launchdPlistPath,
    systemdUnitName,
    systemdUnitPath,
    schtasksTaskName,
    taskScriptPath,
    envDir,
  };
}

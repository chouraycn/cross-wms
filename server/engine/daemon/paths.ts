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

/** 解析用户主目录，缺失时抛错。 */
export function resolveHomeDir(env: Record<string, string | undefined> = process.env): string {
  const home = (env.HOME ?? env.USERPROFILE ?? '').trim();
  if (!home) {
    throw new Error('无法解析用户主目录：HOME/USERPROFILE 未设置');
  }
  return home;
}

/**
 * 解析守护进程在各平台使用的路径。
 * 平台特有路径即使当前平台不适用也会一并返回，便于跨平台渲染与状态展示。
 */
export function resolveDaemonPaths(options: ResolveDaemonPathsOptions = {}): DaemonPaths {
  const env = options.env ?? process.env;
  const homeDir = resolveHomeDir(env);
  const stateDir = options.stateDir ?? path.join(homeDir, DEFAULT_STATE_DIR_NAME);
  const logDir = options.logDir ?? path.join(stateDir, 'logs');
  const stdoutLogPath = path.join(logDir, 'daemon.stdout.log');
  const stderrLogPath = path.join(logDir, 'daemon.stderr.log');
  const pidFilePath = path.join(stateDir, 'daemon.pid');
  const heartbeatFilePath = path.join(stateDir, 'daemon.heartbeat');

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
  const taskScriptPath = path.join(stateDir, 'daemon.cmd');

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
  };
}

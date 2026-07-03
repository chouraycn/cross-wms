/**
 * 守护进程模块统一导出（barrel）
 * 汇总各平台守护进程管理、路径解析、命令构建、状态检查与输出格式化。
 */
export type {
  DaemonServiceConfig,
  DaemonServiceStatus,
} from './service.js';
export { createDaemonService, DaemonService } from './service.js';

export type { DaemonPaths, ResolveDaemonPathsOptions } from './paths.js';
export { resolveDaemonPaths, resolveHomeDir } from './paths.js';

export type { DaemonCmdArgvConfig } from './cmd-argv.js';
export { buildDaemonCmdArgv, resolveDaemonEntry, daemonEntryExists } from './cmd-argv.js';

export type { LaunchdConfig, LaunchdStatus } from './launchd.js';
export {
  generateLaunchdPlist,
  installLaunchd,
  uninstallLaunchd,
  startLaunchd,
  stopLaunchd,
  getLaunchdStatus,
} from './launchd.js';

export type { SystemdConfig, SystemdStatus } from './systemd.js';
export {
  generateSystemdService,
  installSystemd,
  uninstallSystemd,
  startSystemd,
  stopSystemd,
  getSystemdStatus,
} from './systemd.js';

export type { SchtasksConfig, SchtasksStatus } from './schtasks.js';
export {
  generateTaskScript,
  installSchtasks,
  uninstallSchtasks,
  startSchtasks,
  stopSchtasks,
  getSchtasksStatus,
} from './schtasks.js';

export type { DaemonInspectResult, InspectDaemonOptions } from './inspect.js';
export { inspectDaemon, isProcessAlive } from './inspect.js';

export type { DaemonOutputFormat } from './output.js';
export { formatDaemonStatus, formatDaemonList } from './output.js';

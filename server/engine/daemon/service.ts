/**
 * 守护进程统一服务管理门面
 * 自动检测平台：darwin → launchd, linux → systemd, win32 → schtasks。
 * 提供统一接口：install, uninstall, start, stop, restart, status。
 * 参考 openclaw/src/daemon/service.ts 的架构对齐实现。
 */
import { logger } from '../../logger.js';
import { buildDaemonCmdArgv } from './cmd-argv.js';
import { inspectDaemon, type DaemonInspectResult } from './inspect.js';
import {
  getLaunchdStatus,
  installLaunchd,
  startLaunchd,
  stopLaunchd,
  uninstallLaunchd,
  type LaunchdConfig,
  type LaunchdStatus,
} from './launchd.js';
import { resolveDaemonPaths, type DaemonPaths } from './paths.js';
import {
  getSchtasksStatus,
  installSchtasks,
  startSchtasks,
  stopSchtasks,
  uninstallSchtasks,
  type SchtasksConfig,
  type SchtasksStatus,
} from './schtasks.js';
import {
  getSystemdStatus,
  installSystemd,
  startSystemd,
  stopSystemd,
  uninstallSystemd,
  restartSystemd,
  type SystemdConfig,
  type SystemdStatus,
} from './systemd.js';
import {
  repairLaunchdBootstrap,
  type LaunchdBootstrapRepairResult,
} from './launchd.js';

/** 守护进程服务配置。 */
export interface DaemonServiceConfig {
  /** 服务名称（用于状态展示） */
  name: string;
  /** 自定义可执行文件路径（如 node 二进制） */
  command?: string;
  /** 入口脚本路径 */
  entry?: string;
  /** 附加命令参数 */
  args?: string[];
  /** 环境变量 */
  env?: Record<string, string>;
  /** 工作目录 */
  cwd?: string;
  /** 自动重启（KeepAlive / Restart=always），默认 true */
  autoRestart?: boolean;
  /** 重启延迟（毫秒） */
  restartDelayMs?: number;
  /** launchd StartInterval（毫秒） */
  startIntervalMs?: number;
  /** launchd RunAtLoad，默认 true */
  runAtLoad?: boolean;
  /** 服务描述 */
  description?: string;
  /** 通用标签（同时覆盖三个平台默认名） */
  label?: string;
  launchdLabel?: string;
  systemdUnitName?: string;
  schtasksTaskName?: string;
  /** 状态目录覆盖 */
  stateDir?: string;
  /** 日志目录覆盖 */
  logDir?: string;
  /** 标准输出日志路径覆盖 */
  stdoutLog?: string;
  /** 标准错误日志路径覆盖 */
  stderrLog?: string;
  /** PID 文件路径覆盖 */
  pidFile?: string;
}

/** 守护进程统一状态。 */
export interface DaemonServiceStatus {
  name: string;
  platform: NodeJS.Platform;
  installed: boolean;
  running: boolean;
  pid?: number;
  state?: string;
  uptimeMs?: number;
  memoryUsage?: number;
  lastExitStatus?: number;
  detail?: string;
}

type Platform = 'darwin' | 'linux' | 'win32';

function detectPlatform(): Platform {
  if (process.platform === 'darwin') return 'darwin';
  if (process.platform === 'linux') return 'linux';
  if (process.platform === 'win32') return 'win32';
  throw new Error(`不支持的守护进程平台: ${process.platform}`);
}

/** 统一守护进程服务门面。 */
export class DaemonService {
  readonly platform: Platform;
  readonly paths: DaemonPaths;

  constructor(private readonly config: DaemonServiceConfig) {
    this.platform = detectPlatform();
    this.paths = resolveDaemonPaths({
      label: config.label,
      launchdLabel: config.launchdLabel,
      systemdUnitName: config.systemdUnitName,
      schtasksTaskName: config.schtasksTaskName,
      stateDir: config.stateDir,
      logDir: config.logDir,
    });
  }

  /** 构建启动命令参数。 */
  private buildProgramArguments(): string[] {
    return buildDaemonCmdArgv({
      command: this.config.command,
      entry: this.config.entry,
      args: this.config.args,
    });
  }

  /** 解析日志路径（优先使用配置覆盖值）。 */
  private resolveLogPaths(): { stdoutPath: string; stderrPath: string } {
    return {
      stdoutPath: this.config.stdoutLog ?? this.paths.stdoutLogPath,
      stderrPath: this.config.stderrLog ?? this.paths.stderrLogPath,
    };
  }

  /** 构建 launchd 配置。 */
  private toLaunchdConfig(): LaunchdConfig {
    const { stdoutPath, stderrPath } = this.resolveLogPaths();
    return {
      label: this.config.launchdLabel ?? this.config.label,
      programArguments: this.buildProgramArguments(),
      workingDirectory: this.config.cwd,
      environment: this.config.env,
      runAtLoad: this.config.runAtLoad,
      keepAlive: this.config.autoRestart,
      startIntervalMs: this.config.startIntervalMs,
      stdoutPath,
      stderrPath,
      stateDir: this.config.stateDir,
    };
  }

  /** 构建 systemd 配置。 */
  private toSystemdConfig(): SystemdConfig {
    const { stdoutPath, stderrPath } = this.resolveLogPaths();
    return {
      unitName: this.config.systemdUnitName ?? this.config.label,
      programArguments: this.buildProgramArguments(),
      workingDirectory: this.config.cwd,
      environment: this.config.env,
      restart: this.config.autoRestart,
      restartDelayMs: this.config.restartDelayMs,
      description: this.config.description,
      stdoutPath,
      stderrPath,
      stateDir: this.config.stateDir,
    };
  }

  /** 构建 schtasks 配置。 */
  private toSchtasksConfig(): SchtasksConfig {
    return {
      taskName: this.config.schtasksTaskName ?? this.config.label,
      programArguments: this.buildProgramArguments(),
      workingDirectory: this.config.cwd,
      environment: this.config.env,
      description: this.config.description,
      stateDir: this.config.stateDir,
    };
  }

  /** 安装守护进程服务。 */
  async install(): Promise<void> {
    logger.info(`[daemon] 安装守护进程服务 (${this.platform}): ${this.config.name}`);
    switch (this.platform) {
      case 'darwin':
        await installLaunchd(this.toLaunchdConfig());
        return;
      case 'linux':
        await installSystemd(this.toSystemdConfig());
        return;
      case 'win32':
        await installSchtasks(this.toSchtasksConfig());
        return;
    }
  }

  /** 卸载守护进程服务。 */
  async uninstall(): Promise<void> {
    logger.info(`[daemon] 卸载守护进程服务 (${this.platform}): ${this.config.name}`);
    switch (this.platform) {
      case 'darwin':
        await uninstallLaunchd(this.toLaunchdConfig());
        return;
      case 'linux':
        await uninstallSystemd(this.toSystemdConfig());
        return;
      case 'win32':
        await uninstallSchtasks(this.toSchtasksConfig());
        return;
    }
  }

  /** 启动守护进程服务。 */
  async start(): Promise<void> {
    logger.info(`[daemon] 启动守护进程服务 (${this.platform}): ${this.config.name}`);
    switch (this.platform) {
      case 'darwin':
        await startLaunchd(this.toLaunchdConfig());
        return;
      case 'linux':
        await startSystemd(this.toSystemdConfig());
        return;
      case 'win32':
        await startSchtasks(this.toSchtasksConfig());
        return;
    }
  }

  /** 停止守护进程服务。 */
  async stop(): Promise<void> {
    logger.info(`[daemon] 停止守护进程服务 (${this.platform}): ${this.config.name}`);
    switch (this.platform) {
      case 'darwin':
        await stopLaunchd(this.toLaunchdConfig());
        return;
      case 'linux':
        await stopSystemd(this.toSystemdConfig());
        return;
      case 'win32':
        await stopSchtasks(this.toSchtasksConfig());
        return;
    }
  }

  /** 重启守护进程服务（优先使用平台原生重启，回退到 stop+start）。 */
  async restart(): Promise<void> {
    logger.info(`[daemon] 重启守护进程服务 (${this.platform}): ${this.config.name}`);
    switch (this.platform) {
      case 'darwin': {
        // launchd 使用 kickstart 原生重启
        await this.stop().catch((err) => {
          logger.warn(`[daemon] 重启时停止失败，继续尝试启动: ${err.message}`);
        });
        await this.start();
        return;
      }
      case 'linux': {
        // systemd 有原生 restart
        try {
          await restartSystemd(this.toSystemdConfig());
          return;
        } catch {
          // 回退到 stop+start
        }
        await this.stop().catch((err) => {
          logger.warn(`[daemon] 重启时停止失败，继续尝试启动: ${err.message}`);
        });
        await this.start();
        return;
      }
      case 'win32': {
        await this.stop().catch((err) => {
          logger.warn(`[daemon] 重启时停止失败，继续尝试启动: ${err.message}`);
        });
        await this.start();
        return;
      }
    }
  }

  /**
   * 修复守护进程服务（仅 macOS launchd 支持）。
   * 用于服务已安装但未正确加载的 bootstrap 修复场景。
   */
  async repair(): Promise<LaunchdBootstrapRepairResult | null> {
    if (this.platform !== 'darwin') {
      return null;
    }
    return repairLaunchdBootstrap(this.toLaunchdConfig());
  }

  /** 查询守护进程服务状态（结合平台状态与进程检查）。 */
  async status(): Promise<DaemonServiceStatus> {
    const pidFile = this.config.pidFile ?? this.paths.pidFilePath;
    let platformStatus: {
      installed: boolean;
      running: boolean;
      pid?: number;
      state?: string;
      lastExitStatus?: number;
      detail?: string;
    };

    switch (this.platform) {
      case 'darwin': {
        platformStatus = await this.normalizeLaunchdStatus();
        break;
      }
      case 'linux': {
        platformStatus = await this.normalizeSystemdStatus();
        break;
      }
      case 'win32': {
        platformStatus = await this.normalizeSchtasksStatus();
        break;
      }
    }

    // 进一步通过 PID 文件与进程检查补充运行时长与内存占用
    const inspect: DaemonInspectResult = await inspectDaemon({
      pidFile,
      pid: platformStatus.pid,
      heartbeatFile: this.paths.heartbeatFilePath,
    }).catch(() => ({ running: false }));

    const running = platformStatus.running || inspect.running;

    return {
      name: this.config.name,
      platform: this.platform,
      installed: platformStatus.installed,
      running,
      pid: platformStatus.pid ?? inspect.pid,
      state: platformStatus.state,
      uptimeMs: inspect.uptimeMs,
      memoryUsage: inspect.memoryUsage,
      lastExitStatus: platformStatus.lastExitStatus,
      detail: platformStatus.detail ?? inspect.detail,
    };
  }

  /** 归一化 launchd 状态为统一结构。 */
  private async normalizeLaunchdStatus(): Promise<LaunchdStatus> {
    return await getLaunchdStatus(this.toLaunchdConfig());
  }

  /** 归一化 systemd 状态为统一结构。 */
  private async normalizeSystemdStatus(): Promise<SystemdStatus> {
    return await getSystemdStatus(this.toSystemdConfig());
  }

  /** 归一化 schtasks 状态为统一结构。 */
  private async normalizeSchtasksStatus(): Promise<SchtasksStatus> {
    return await getSchtasksStatus(this.toSchtasksConfig());
  }
}

/** 创建守护进程服务实例。 */
export function createDaemonService(config: DaemonServiceConfig): DaemonService {
  return new DaemonService(config);
}

export type { DaemonInspectResult };

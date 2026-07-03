/**
 * Daemon Manager
 * 守护进程管理器 - 管理后台服务进程。
 *
 * 本模块提供两层能力：
 * 1. 进程内守护进程生命周期管理（start/stop/restart/健康检查）；
 * 2. 操作系统级守护进程服务管理（launchd/systemd/schtasks），委托给
 *    ./daemon/ 下的平台模块实现。
 *
 * 已重构为使用新的 server/engine/daemon/ 模块作为 OS 级服务后端。
 */

import { logger } from '../logger.js';
import {
  createDaemonService,
  type DaemonService,
  type DaemonServiceConfig,
  type DaemonServiceStatus,
} from './daemon/index.js';

export type DaemonStatus = 'running' | 'stopped' | 'error' | 'restarting' | 'starting' | 'stopping';
export type DaemonType = 'server' | 'worker' | 'scheduler' | 'watcher' | 'cron';

export interface DaemonProcess {
  id: string;
  name: string;
  type: DaemonType;
  status: DaemonStatus;
  command: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
  pid?: number;
  port?: number;
  startedAt?: number;
  stoppedAt?: number;
  lastRestartAt?: number;
  restartCount: number;
  maxRestarts: number;
  autoRestart: boolean;
  restartDelayMs: number;
  stderr?: string;
  stdout?: string;
  errorMessage?: string;
  uptimeMs: number;
  memoryUsage?: number;
  cpuUsage?: number;
  logBuffer: Array<{
    timestamp: number;
    level: 'info' | 'warn' | 'error' | 'debug';
    message: string;
  }>;
  metadata?: Record<string, unknown>;
}

export interface DaemonStartOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  port?: number;
  autoRestart?: boolean;
  maxRestarts?: number;
  restartDelayMs?: number;
  metadata?: Record<string, unknown>;
}

class DaemonManager {
  private readonly daemons = new Map<string, DaemonProcess>();
  private readonly restartTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly osServices = new Map<string, DaemonService>();
  private healthCheckIntervalMs = 30000;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // 空构造函数
  }

  // ========== Daemon Lifecycle ==========

  async start(name: string, type: DaemonType, options: DaemonStartOptions): Promise<DaemonProcess> {
    const id = `daemon_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    const daemon: DaemonProcess = {
      id,
      name,
      type,
      status: 'starting',
      command: options.command,
      args: options.args ?? [],
      env: options.env,
      cwd: options.cwd,
      port: options.port,
      restartCount: 0,
      maxRestarts: options.maxRestarts ?? 5,
      autoRestart: options.autoRestart ?? true,
      restartDelayMs: options.restartDelayMs ?? 5000,
      uptimeMs: 0,
      logBuffer: [],
      metadata: options.metadata,
    };

    this.daemons.set(id, daemon);
    this.log(id, 'info', `Starting ${type} daemon: ${name}`);

    try {
      // 模拟启动过程
      await this.simulateStart(daemon);
      daemon.status = 'running';
      daemon.startedAt = Date.now();
      daemon.pid = Math.floor(Math.random() * 60000) + 1000;
      this.daemons.set(id, daemon);
      this.log(id, 'info', `Daemon started successfully (PID: ${daemon.pid})`);
      return daemon;
    } catch (error) {
      daemon.status = 'error';
      daemon.errorMessage = error instanceof Error ? error.message : String(error);
      this.daemons.set(id, daemon);
      this.log(id, 'error', `Daemon failed to start: ${daemon.errorMessage}`);
      throw error;
    }
  }

  private async simulateStart(daemon: DaemonProcess): Promise<void> {
    // 模拟启动过程
    await new Promise((resolve) => setTimeout(resolve, 200));

    // 模拟一些启动日志
    this.log(daemon.id, 'debug', `Running: ${daemon.command} ${daemon.args.join(' ')}`);
    this.log(daemon.id, 'debug', 'Initializing...');
  }

  async stop(id: string, reason = 'manual'): Promise<boolean> {
    const daemon = this.daemons.get(id);
    if (!daemon) return false;

    if (daemon.status === 'stopped' || daemon.status === 'stopping') {
      return true;
    }

    // 清除重启定时器
    const timer = this.restartTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.restartTimers.delete(id);
    }

    daemon.status = 'stopping';
    this.daemons.set(id, daemon);
    this.log(id, 'info', `Stopping daemon (reason: ${reason})`);

    // 模拟停止过程
    await new Promise((resolve) => setTimeout(resolve, 100));

    daemon.status = 'stopped';
    daemon.stoppedAt = Date.now();
    if (daemon.startedAt) {
      daemon.uptimeMs = Date.now() - daemon.startedAt;
    }
    this.daemons.set(id, daemon);
    this.log(id, 'info', 'Daemon stopped');

    return true;
  }

  async restart(id: string): Promise<DaemonProcess | null> {
    const daemon = this.daemons.get(id);
    if (!daemon) return null;

    this.log(id, 'info', 'Restarting daemon');
    daemon.lastRestartAt = Date.now();
    daemon.restartCount++;
    daemon.status = 'restarting';
    this.daemons.set(id, daemon);

    await this.stop(id, 'restart');
    return this.start(daemon.name, daemon.type, {
      command: daemon.command,
      args: daemon.args,
      env: daemon.env,
      cwd: daemon.cwd,
      port: daemon.port,
      autoRestart: daemon.autoRestart,
      maxRestarts: daemon.maxRestarts,
      restartDelayMs: daemon.restartDelayMs,
      metadata: daemon.metadata,
    });
  }

  // ========== OS-Level Service Management ==========

  /**
   * 安装操作系统级守护进程服务（macOS launchd / Linux systemd / Windows schtasks）。
   * 返回服务句柄的缓存键，后续可用 osServiceStatus / osServiceStart 等方法操作。
   */
  async installOsService(
    key: string,
    config: DaemonServiceConfig,
  ): Promise<DaemonService> {
    const service = createDaemonService(config);
    await service.install();
    this.osServices.set(key, service);
    logger.info(`[daemon] OS 服务已安装: ${key} (${service.platform})`);
    return service;
  }

  /** 卸载操作系统级守护进程服务。 */
  async uninstallOsService(key: string): Promise<void> {
    const service = this.osServices.get(key);
    if (!service) {
      logger.warn(`[daemon] OS 服务未注册: ${key}`);
      return;
    }
    await service.uninstall();
    this.osServices.delete(key);
    logger.info(`[daemon] OS 服务已卸载: ${key}`);
  }

  /** 查询操作系统级守护进程服务状态。 */
  async osServiceStatus(key: string): Promise<DaemonServiceStatus | null> {
    const service = this.osServices.get(key);
    if (!service) return null;
    return await service.status();
  }

  /** 启动操作系统级守护进程服务。 */
  async osServiceStart(key: string): Promise<void> {
    const service = this.osServices.get(key);
    if (!service) throw new Error(`OS 服务未注册: ${key}`);
    await service.start();
  }

  /** 停止操作系统级守护进程服务。 */
  async osServiceStop(key: string): Promise<void> {
    const service = this.osServices.get(key);
    if (!service) throw new Error(`OS 服务未注册: ${key}`);
    await service.stop();
  }

  /** 重启操作系统级守护进程服务。 */
  async osServiceRestart(key: string): Promise<void> {
    const service = this.osServices.get(key);
    if (!service) throw new Error(`OS 服务未注册: ${key}`);
    await service.restart();
  }

  // ========== Health Monitoring ==========

  startHealthCheck(): void {
    if (this.healthCheckTimer) return;

    this.healthCheckTimer = setInterval(() => this.healthCheck(), this.healthCheckIntervalMs);
    console.log('[daemon] Health check started');
  }

  stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    console.log('[daemon] Health check stopped');
  }

  private healthCheck(): void {
    for (const [id, daemon] of this.daemons) {
      if (daemon.status === 'running') {
        // 模拟健康检查
        if (Math.random() < 0.01) {
          // 1% 概率模拟故障，用于测试自动重启
          this.handleDaemonCrash(id);
        }
      }
    }
  }

  private handleDaemonCrash(id: string): void {
    const daemon = this.daemons.get(id);
    if (!daemon) return;

    daemon.status = 'error';
    daemon.errorMessage = 'Process crashed (simulated)';
    daemon.stoppedAt = Date.now();
    if (daemon.startedAt) {
      daemon.uptimeMs = Date.now() - daemon.startedAt;
    }
    this.daemons.set(id, daemon);
    this.log(id, 'error', `Daemon crashed: ${daemon.errorMessage}`);

    if (daemon.autoRestart && daemon.restartCount < daemon.maxRestarts) {
      this.scheduleRestart(id);
    }
  }

  private scheduleRestart(id: string): void {
    const daemon = this.daemons.get(id);
    if (!daemon) return;

    this.log(
      id,
      'info',
      `Scheduling restart in ${daemon.restartDelayMs}ms (${daemon.restartCount + 1}/${daemon.maxRestarts})`,
    );

    const timer = setTimeout(() => {
      this.restartTimers.delete(id);
      this.restart(id).catch((err) => {
        this.log(id, 'error', `Restart failed: ${err.message}`);
      });
    }, daemon.restartDelayMs);

    this.restartTimers.set(id, timer);
  }

  // ========== Query ==========

  getDaemon(id: string): DaemonProcess | undefined {
    return this.daemons.get(id);
  }

  listDaemons(options?: {
    type?: DaemonType;
    status?: DaemonStatus;
  }): DaemonProcess[] {
    let daemons = Array.from(this.daemons.values());

    if (options?.type) {
      daemons = daemons.filter((d) => d.type === options.type);
    }
    if (options?.status) {
      daemons = daemons.filter((d) => d.status === options.status);
    }

    return daemons.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
  }

  getLogs(id: string, limit = 50): DaemonProcess['logBuffer'] {
    const daemon = this.daemons.get(id);
    if (!daemon) return [];
    return daemon.logBuffer.slice(-limit);
  }

  // ========== Logging ==========

  private log(id: string, level: 'info' | 'warn' | 'error' | 'debug', message: string): void {
    const daemon = this.daemons.get(id);
    if (!daemon) return;

    daemon.logBuffer.push({
      timestamp: Date.now(),
      level,
      message,
    });

    // 限制日志缓冲区大小
    if (daemon.logBuffer.length > 200) {
      daemon.logBuffer.splice(0, daemon.logBuffer.length - 200);
    }

    this.daemons.set(id, daemon);
  }

  // ========== Stats ==========

  getStats(): {
    total: number;
    running: number;
    stopped: number;
    error: number;
    starting: number;
    stopping: number;
    restarting: number;
    totalRestarts: number;
    byType: Record<DaemonType, number>;
  } {
    const daemons = Array.from(this.daemons.values());
    const byType = {} as Record<DaemonType, number>;

    for (const daemon of daemons) {
      byType[daemon.type] = (byType[daemon.type] ?? 0) + 1;
    }

    return {
      total: daemons.length,
      running: daemons.filter((d) => d.status === 'running').length,
      stopped: daemons.filter((d) => d.status === 'stopped').length,
      error: daemons.filter((d) => d.status === 'error').length,
      starting: daemons.filter((d) => d.status === 'starting').length,
      stopping: daemons.filter((d) => d.status === 'stopping').length,
      restarting: daemons.filter((d) => d.status === 'restarting').length,
      totalRestarts: daemons.reduce((sum, d) => sum + d.restartCount, 0),
      byType,
    };
  }

  clear(): void {
    this.stopHealthCheck();
    for (const timer of this.restartTimers.values()) {
      clearTimeout(timer);
    }
    this.restartTimers.clear();
    this.daemons.clear();
    this.osServices.clear();
  }
}

const DAEMON_INSTANCE = new DaemonManager();

export function getDaemonManager(): DaemonManager {
  return DAEMON_INSTANCE;
}

export function startDaemon(
  name: string,
  type: DaemonType,
  options: DaemonStartOptions,
): Promise<DaemonProcess> {
  return DAEMON_INSTANCE.start(name, type, options);
}

export function stopDaemon(id: string, reason?: string): Promise<boolean> {
  return DAEMON_INSTANCE.stop(id, reason);
}

export function restartDaemon(id: string): Promise<DaemonProcess | null> {
  return DAEMON_INSTANCE.restart(id);
}

export function resetDaemonManagerForTests(): void {
  DAEMON_INSTANCE.clear();
}

export type { DaemonManager, DaemonServiceConfig, DaemonServiceStatus };

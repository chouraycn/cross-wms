/**
 * 资源监控
 *
 * 周期性采样进程的 CPU/内存/IO/句柄使用情况。
 */

import { logger } from '../../logger.js';
import type { ResourceUsage } from './types.js';

/** 监控配置 */
export interface MonitorConfig {
  /** 采样间隔（毫秒） */
  intervalMs: number;
  /** 最大历史样本数 */
  maxSamples?: number;
  /** 采样函数（注入便于测试） */
  sampler?: (pid: number) => ResourceUsage | Promise<ResourceUsage>;
  /** 定时器实现（注入便于测试） */
  scheduler?: typeof setInterval;
  /** 清除定时器实现（注入便于测试） */
  clearer?: typeof clearInterval;
  /** 当前时间（注入便于测试） */
  now?: () => number;
}

const DEFAULT_INTERVAL_MS = 5_000;
const DEFAULT_MAX_SAMPLES = 60;

const defaultSampler = (pid: number): ResourceUsage => {
  // 真实环境会调用 process.kill(pid, 0) / pidusage / /proc/<pid>/stat 等。
  // 这里返回一个空骨架；真实采样由更上层的依赖注入完成。
  return {
    pid,
    timestamp: Date.now(),
    cpuPercent: 0,
    memoryMb: 0,
    rssBytes: 0,
  };
};

const isProcessAlive = (pid?: number): boolean => {
  if (typeof pid !== 'number' || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/**
 * 进程资源监控器
 *
 * 一个实例对应一个 pid；start 后周期性采样。
 */
export class ProcessMonitor {
  private readonly config: Required<MonitorConfig>;
  private readonly history: ResourceUsage[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private readonly pid: number;
  private readonly hasCustomSampler: boolean;
  private lastError: Error | null = null;

  constructor(pid: number, config?: MonitorConfig) {
    if (typeof pid !== 'number' || !Number.isFinite(pid) || pid <= 0) {
      throw new Error(`ProcessMonitor requires positive pid, got ${pid}`);
    }
    this.pid = pid;
    this.hasCustomSampler = config?.sampler !== undefined;
    this.config = {
      intervalMs: config?.intervalMs ?? DEFAULT_INTERVAL_MS,
      maxSamples: config?.maxSamples ?? DEFAULT_MAX_SAMPLES,
      sampler: config?.sampler ?? defaultSampler,
      scheduler: config?.scheduler ?? setInterval,
      clearer: config?.clearer ?? clearInterval,
      now: config?.now ?? (() => Date.now()),
    };
  }

  /** 启动周期采样 */
  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.timer = this.config.scheduler(() => {
      void this.sample();
    }, this.config.intervalMs);
  }

  /** 停止采样 */
  stop(): void {
    this.running = false;
    if (this.timer) {
      this.config.clearer(this.timer);
      this.timer = null;
    }
  }

  /** 主动采样一次（不依赖 start） */
  async sample(): Promise<ResourceUsage | null> {
    try {
      if (!this.hasCustomSampler && !isProcessAlive(this.pid)) {
        return null;
      }
      const usage = await this.config.sampler(this.pid);
      this.history.push(usage);
      while (this.history.length > this.config.maxSamples) {
        this.history.shift();
      }
      this.lastError = null;
      return usage;
    } catch (err) {
      this.lastError = err instanceof Error ? err : new Error(String(err));
      logger.debug(
        `[Process:Monitor] pid=${this.pid} sample failed: ${this.lastError.message}`,
      );
      return null;
    }
  }

  /** 当前 pid */
  getPid(): number {
    return this.pid;
  }

  /** 是否在采样中 */
  isRunning(): boolean {
    return this.running;
  }

  /** 上次错误 */
  getLastError(): Error | null {
    return this.lastError;
  }

  /** 历史快照（不可变副本） */
  getHistory(): ResourceUsage[] {
    return [...this.history];
  }

  /** 最近一次采样 */
  last(): ResourceUsage | null {
    return this.history.length === 0
      ? null
      : { ...this.history[this.history.length - 1] };
  }

  /** 计算平均 CPU 使用率 */
  averageCpuPercent(): number {
    if (this.history.length === 0) {
      return 0;
    }
    return this.history.reduce((sum, u) => sum + u.cpuPercent, 0) / this.history.length;
  }

  /** 计算峰值内存（MB） */
  peakMemoryMb(): number {
    if (this.history.length === 0) {
      return 0;
    }
    return this.history.reduce((max, u) => Math.max(max, u.memoryMb), 0);
  }

  /** 清空历史 */
  clearHistory(): void {
    this.history.length = 0;
  }
}

import { logger } from '../../logger.js';
import type { ResourceMonitorOptions, ResourceSnapshot } from './types.js';

const DEFAULT_SAMPLE_INTERVAL_MS = 1000;
const DEFAULT_MAX_MEMORY_MB = 2048;
const DEFAULT_MAX_CPU_PERCENT = 90;

export class ResourceMonitor {
  private options: Required<ResourceMonitorOptions>;
  private snapshots: ResourceSnapshot[] = [];
  private maxSnapshots = 3600;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private startTime = 0;
  private isRunning = false;
  private lastCpuUsage: { user: number; system: number } | null = null;
  private lastCpuTime = 0;

  constructor(options: ResourceMonitorOptions = {}) {
    this.options = {
      sampleIntervalMs: options.sampleIntervalMs ?? DEFAULT_SAMPLE_INTERVAL_MS,
      maxMemoryMB: options.maxMemoryMB ?? DEFAULT_MAX_MEMORY_MB,
      maxCpuPercent: options.maxCpuPercent ?? DEFAULT_MAX_CPU_PERCENT,
      onExceedLimit: options.onExceedLimit ?? (() => {}),
    };
  }

  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.startTime = Date.now();
    this.lastCpuUsage = this.getCpuUsage();
    this.lastCpuTime = Date.now();

    this.intervalId = setInterval(() => {
      this.sample();
    }, this.options.sampleIntervalMs);

    logger.info('[ResourceMonitor] Started');
  }

  stop(): void {
    if (!this.isRunning) return;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
    logger.info('[ResourceMonitor] Stopped');
  }

  private sample(): void {
    const memoryUsage = process.memoryUsage();
    const cpuPercent = this.calculateCpuPercent();
    const uptimeMs = Date.now() - this.startTime;

    const snapshot: ResourceSnapshot = {
      timestamp: Date.now(),
      memoryBytes: memoryUsage.heapUsed,
      cpuPercent,
      uptimeMs,
    };

    this.snapshots.push(snapshot);

    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }

    const memoryMB = memoryUsage.heapUsed / (1024 * 1024);
    if (memoryMB > this.options.maxMemoryMB) {
      this.options.onExceedLimit('memory', memoryMB, this.options.maxMemoryMB);
      logger.warn(`[ResourceMonitor] Memory limit exceeded: ${memoryMB.toFixed(1)}MB / ${this.options.maxMemoryMB}MB`);
    }

    if (cpuPercent > this.options.maxCpuPercent) {
      this.options.onExceedLimit('cpu', cpuPercent, this.options.maxCpuPercent);
      logger.warn(`[ResourceMonitor] CPU limit exceeded: ${cpuPercent.toFixed(1)}% / ${this.options.maxCpuPercent}%`);
    }
  }

  private getCpuUsage(): { user: number; system: number } {
    const usage = process.cpuUsage();
    return {
      user: usage.user,
      system: usage.system,
    };
  }

  private calculateCpuPercent(): number {
    const now = Date.now();
    const current = this.getCpuUsage();

    if (!this.lastCpuUsage) {
      this.lastCpuUsage = current;
      this.lastCpuTime = now;
      return 0;
    }

    const timeDiff = (now - this.lastCpuTime) * 1000;
    const userDiff = current.user - this.lastCpuUsage.user;
    const systemDiff = current.system - this.lastCpuUsage.system;

    const cpuPercent = timeDiff > 0 ? ((userDiff + systemDiff) / timeDiff) * 100 : 0;

    this.lastCpuUsage = current;
    this.lastCpuTime = now;

    return Math.min(cpuPercent, 100);
  }

  getCurrentSnapshot(): ResourceSnapshot | null {
    if (this.snapshots.length === 0) return null;
    return this.snapshots[this.snapshots.length - 1];
  }

  getHistory(): ResourceSnapshot[] {
    return [...this.snapshots];
  }

  getAverage(durationMs?: number): { memoryBytes: number; cpuPercent: number } | null {
    if (this.snapshots.length === 0) return null;

    let snapshots = this.snapshots;
    if (durationMs) {
      const cutoff = Date.now() - durationMs;
      snapshots = this.snapshots.filter(s => s.timestamp >= cutoff);
    }

    if (snapshots.length === 0) return null;

    const totalMemory = snapshots.reduce((sum, s) => sum + s.memoryBytes, 0);
    const totalCpu = snapshots.reduce((sum, s) => sum + s.cpuPercent, 0);

    return {
      memoryBytes: totalMemory / snapshots.length,
      cpuPercent: totalCpu / snapshots.length,
    };
  }

  getPeak(durationMs?: number): { memoryBytes: number; cpuPercent: number } | null {
    if (this.snapshots.length === 0) return null;

    let snapshots = this.snapshots;
    if (durationMs) {
      const cutoff = Date.now() - durationMs;
      snapshots = this.snapshots.filter(s => s.timestamp >= cutoff);
    }

    if (snapshots.length === 0) return null;

    let peakMemory = 0;
    let peakCpu = 0;

    for (const s of snapshots) {
      if (s.memoryBytes > peakMemory) peakMemory = s.memoryBytes;
      if (s.cpuPercent > peakCpu) peakCpu = s.cpuPercent;
    }

    return { memoryBytes: peakMemory, cpuPercent: peakCpu };
  }

  getUptimeMs(): number {
    if (!this.isRunning && this.startTime === 0) return 0;
    return Date.now() - this.startTime;
  }

  isActive(): boolean {
    return this.isRunning;
  }

  setMaxMemoryMB(max: number): void {
    this.options.maxMemoryMB = max;
  }

  setMaxCpuPercent(max: number): void {
    this.options.maxCpuPercent = max;
  }

  clearHistory(): void {
    this.snapshots = [];
  }

  getSnapshotCount(): number {
    return this.snapshots.length;
  }
}

export function createResourceMonitor(options?: ResourceMonitorOptions): ResourceMonitor {
  return new ResourceMonitor(options);
}

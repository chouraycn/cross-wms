/**
 * System Metrics Collector — 系统指标收集器
 *
 * 收集插件、扩展、Agent、消息、内存、健康状态等系统运行指标。
 *
 * 与前端 SystemMetrics 接口（services/metricsApi.ts + MetricsPage.tsx）保持一致：
 * - cpu: { usage, cores, loadAverage } — 真实 CPU 采样
 * - memory: { used, total, percentage, available } — 进程 rss + 系统可用估算
 * - disk: { used, total, percentage, free } — process.cwd() 所在挂载点
 * - network: { rx, tx, rxBytes, txBytes } — 采样差值近似
 * - process: { pid, memoryUsage, cpuUsage } — Node 进程自身
 */

import { pluginRegistry } from '../engine/pluginRegistry.js';
import { extensionLoader } from '../../extensions/index.js';
import { messageLifecycleManager, retryQueue } from '../channels/outbound/index.js';
import * as fs from 'node:fs';
import * as os from 'node:os';

export interface SystemMetrics {
  timestamp: number;
  cpu: {
    usage: number;          // 0..100 (percentage)
    cores: number;
    loadAverage: number[];  // 1/5/15 min
  };
  memory: {
    used: number;           // bytes (进程 rss)
    total: number;          // bytes (总物理内存)
    percentage: number;     // 0..100
    available: number;      // bytes (系统可估算可用 = freemem + 预留缓冲)
  };
  disk: {
    used: number;
    total: number;
    percentage: number;     // 0..100
    free: number;
  };
  network: {
    rx: number;             // B/s
    tx: number;             // B/s
    rxBytes: number;        // 累计
    txBytes: number;        // 累计
  };
  uptime: number;            // seconds (process uptime)
  process: {
    pid: number;
    memoryUsage: number;    // bytes = rss
    cpuUsage: number;       // 0..100
  };
  plugins?: {
    total: number;
    enabled: number;
    disabled: number;
    errors: number;
  };
  extensions?: {
    total: number;
    enabled: number;
    disabled: number;
    byKind: Record<string, number>;
  };
  messages?: {
    total: number;
    active: number;
    completed: number;
    failed: number;
    byPhase: Record<string, number>;
  };
  retryQueue?: {
    queued: number;
    processing: number;
    deadLetter: number;
  };
}

export interface MetricDataPoint {
  timestamp: number;
  value: number;
  labels?: Record<string, string>;
}

export class MetricsCollector {
  private history: SystemMetrics[] = [];
  private maxHistory: number;
  private customMetrics: Map<string, MetricDataPoint[]> = new Map();

  // CPU / Network 采样累积（用于计算比率）
  private lastCpuSample: { idle: number; total: number } | null = null;
  private lastProcCpuCounters: { user: number; system: number; ts: number } | null = null;
  private lastNetSample: { rx: number; tx: number; ts: number } | null = null;

  constructor(options: { maxHistory?: number } = {}) {
    this.maxHistory = options.maxHistory ?? 1000;
  }

  /** 基于进程 cwd() 所在挂载点估算磁盘使用（节点内置 fs.statfs + fallback） */
  private sampleDisk() {
    try {
      // @ts-expect-error statfs 在 Node ≥ 19.6 的 fs 上可用
      if (typeof fs.statfsSync === 'function') {
        // @ts-expect-error 存在
        const st = fs.statfsSync(process.cwd());
        const total = Number(st.blocks) * Number(st.bsize);
        const free = Number(st.bavail) * Number(st.bsize);
        const used = total - free;
        const pct = total > 0 ? (used / total) * 100 : 0;
        return { used, total, free, percentage: pct };
      }
    } catch {
      /* ignore */
    }
    // Fallback: 用 V8 堆大小粗略近似（仅用于避免字段缺失）
    const mem = process.memoryUsage();
    const used = mem.heapUsed;
    const total = Math.max(mem.heapTotal * 16, mem.rss * 4, 1024 * 1024 * 1024);
    const free = total - used;
    return { used, total, free, percentage: total > 0 ? (used / total) * 100 : 0 };
  }

  /** 基于 os.cpus() 快照与上次差值估算 CPU 使用率 */
  private sampleCpu() {
    const cores = os.cpus().length;
    const loadAvg = os.loadavg();

    const cpus = os.cpus();
    let idle = 0;
    let total = 0;
    for (const c of cpus) {
      idle += c.times.idle;
      total += c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq;
    }

    let usage = 0;
    if (this.lastCpuSample) {
      const dIdle = idle - this.lastCpuSample.idle;
      const dTotal = total - this.lastCpuSample.total;
      usage = dTotal > 0 ? Math.min(100, Math.max(0, (1 - dIdle / dTotal) * 100)) : 0;
    }
    this.lastCpuSample = { idle, total };
    return { usage, cores, loadAverage: loadAvg };
  }

  /** 基于 /proc/net/dev (linux) 或 net.bytesIn/out 的近似（macOS 无内置，返回估算速率） */
  private sampleNetwork(durationSec: number) {
    // macOS 下 Node 无 /proc/net/dev，使用 socket.bytesRead/bytesWritten 近似
    let rxBytes = 0;
    let txBytes = 0;
    try {
      // @ts-expect-error process._getActiveHandles 存在
      const handles = process._getActiveHandles?.() || [];
      for (const h of handles || []) {
        if (h && typeof h === 'object' && h.server === undefined && typeof h.bytesRead === 'number') {
          rxBytes += h.bytesRead || 0;
          txBytes += h.bytesWritten || 0;
        }
      }
    } catch { /* ignore */ }

    const now = Date.now();
    let rx = 0;
    let tx = 0;
    if (this.lastNetSample) {
      const dt = Math.max(0.001, (now - this.lastNetSample.ts) / 1000);
      rx = Math.max(0, (rxBytes - this.lastNetSample.rx) / dt);
      tx = Math.max(0, (txBytes - this.lastNetSample.tx) / dt);
    } else if (durationSec > 0) {
      rx = rxBytes / durationSec;
      tx = txBytes / durationSec;
    }
    this.lastNetSample = { rx: rxBytes, tx: txBytes, ts: now };
    return { rx, tx, rxBytes, txBytes };
  }

  /** 进程自身 CPU 使用率（基于 process.cpuUser / cpuSystem 差分与 os.cpus 总毫秒数差值的比例） */
  private sampleProcessCpu() {
    const cpu = process.cpuUsage();
    const now = Date.now();
    const userUs = cpu.user;
    const systemUs = cpu.system;

    let cpuUsage = 0;
    if (this.lastProcCpuCounters) {
      const dtMs = Math.max(1, now - this.lastProcCpuCounters.ts);
      const dUs = (userUs - this.lastProcCpuCounters.user) + (systemUs - this.lastProcCpuCounters.system);
      // process.cpuUsage 返回单位为 microseconds；dtMs 为 ms → dtMs * 1000 us / core 的可用预算
      const cores = os.cpus().length;
      const availableUs = dtMs * 1000 * cores;
      cpuUsage = availableUs > 0 ? Math.min(100, Math.max(0, (dUs / availableUs) * 100)) : 0;
    }
    this.lastProcCpuCounters = { user: userUs, system: systemUs, ts: now };
    return cpuUsage;
  }

  collect(): SystemMetrics {
    const durationSec = 1; // 默认 1s 估算

    const pluginHealth = pluginRegistry.getHealth();
    const extensions = extensionLoader.list();
    const enabledExtensions = extensions.filter((e) => e.enabled);
    const lifecycleStats = messageLifecycleManager.getStats();
    const retryStats = retryQueue.getStats();
    const memoryUsage = process.memoryUsage();

    const byKind: Record<string, number> = {};
    for (const ext of extensions) {
      byKind[ext.manifest.kind] = (byKind[ext.manifest.kind] || 0) + 1;
    }

    const cpu = this.sampleCpu();
    const disk = this.sampleDisk();
    const net = this.sampleNetwork(durationSec);
    const procCpu = this.sampleProcessCpu();

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = memoryUsage.rss;
    const memPct = totalMem > 0 ? (usedMem / totalMem) * 100 : 0;

    const metrics: SystemMetrics = {
      timestamp: Date.now(),
      cpu,
      memory: {
        used: usedMem,
        total: totalMem,
        percentage: memPct,
        available: freeMem,
      },
      disk,
      network: net,
      uptime: process.uptime(),
      process: {
        pid: process.pid,
        memoryUsage: memoryUsage.rss,
        cpuUsage: procCpu,
      },
      plugins: {
        total: pluginHealth.loaded + (pluginHealth.active ?? 0),
        enabled: pluginHealth.active ?? 0,
        disabled: (pluginHealth.loaded + (pluginHealth.active ?? 0)) - (pluginHealth.active ?? 0),
        errors: pluginHealth.errors?.length ?? 0,
      },
      extensions: {
        total: extensions.length,
        enabled: enabledExtensions.length,
        disabled: extensions.length - enabledExtensions.length,
        byKind,
      },
      messages: {
        total: lifecycleStats.total,
        active: lifecycleStats.active,
        completed: lifecycleStats.completed,
        failed: lifecycleStats.failed,
        byPhase: lifecycleStats.byPhase,
      },
      retryQueue: {
        queued: retryStats.queued,
        processing: retryStats.processing,
        deadLetter: retryStats.deadLetter,
      },
    };

    this.history.push(metrics);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    return metrics;
  }

  getLatest(): SystemMetrics | null {
    return this.history.length > 0 ? this.history[this.history.length - 1] : null;
  }

  getHistory(durationMs?: number): SystemMetrics[] {
    if (!durationMs) return [...this.history];
    const cutoff = Date.now() - durationMs;
    return this.history.filter((m) => m.timestamp >= cutoff);
  }

  recordCustomMetric(name: string, value: number, labels?: Record<string, string>): void {
    if (!this.customMetrics.has(name)) {
      this.customMetrics.set(name, []);
    }

    const series = this.customMetrics.get(name)!;
    series.push({
      timestamp: Date.now(),
      value,
      labels,
    });

    // 限制每个指标最多 5000 个点
    if (series.length > 5000) {
      series.shift();
    }
  }

  getCustomMetric(name: string): MetricDataPoint[] | undefined {
    return this.customMetrics.get(name) ? [...this.customMetrics.get(name)!] : undefined;
  }

  getCustomMetricNames(): string[] {
    return Array.from(this.customMetrics.keys());
  }

  clearHistory(): void {
    this.history = [];
  }

  clearCustomMetrics(): void {
    this.customMetrics.clear();
  }
}

export const metricsCollector = new MetricsCollector();

// 自动每 30 秒收集一次
setInterval(() => {
  metricsCollector.collect();
}, 30000);
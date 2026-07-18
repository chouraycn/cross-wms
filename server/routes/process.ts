/**
 * 进程管理 REST API 路由 — 受管理进程的查询与控制
 *
 * 提供以下端点：
 * GET   /api/process/list          → 列出所有托管进程
 * GET   /api/process/:id           → 获取单个进程详情
 * POST  /api/process/:id/restart   → 重启进程
 * POST  /api/process/:id/stop      → 停止进程
 * GET   /api/process/:id/health    → 健康检查状态
 * GET   /api/process/:id/resources → 资源使用情况（CPU/内存）
 *
 * 实现说明：
 * - 调用 engine/process/manager.ts 的 ProcessManager.list() 获取真实数据
 * - 由于 manager 单例通常无托管进程，额外维护演示数据（与 pairing 路由风格一致）
 * - 演示数据保存在进程内存储，重启 / 停止操作会就地更新状态
 */

import { Router, type Request, type Response } from 'express';
import { logger } from '../logger.js';
import { getProcessManager } from '../engine/process/index.js';
import type {
  ProcessSnapshot,
  ProcessState,
  ResourceUsage,
  HealthStatus,
  HealthCheckResult,
} from '../engine/process/index.js';

const router = Router();

// ===================== 类型扩展 =====================

/**
 * 演示进程记录：在 ProcessSnapshot 基础上补充命令行信息，
 * 便于前端详情对话框展示完整信息。
 */
interface DemoProcess extends ProcessSnapshot {
  /** 可执行文件路径 */
  command: string;
  /** 命令行参数 */
  args: string[];
  /** 工作目录 */
  cwd?: string;
}

// ===================== 进程内存储 =====================

const demoProcesses = new Map<string, DemoProcess>();
const healthHistory = new Map<string, HealthCheckResult[]>();
const resourceHistory = new Map<string, ResourceUsage[]>();

const MAX_RESOURCE_SAMPLES = 30;
const MAX_HEALTH_SAMPLES = 20;

/** 生成模拟资源采样历史 */
function generateResourceHistory(
  baseCpu: number,
  baseMemoryMb: number,
  baseRssBytes: number,
  pid: number,
  count: number = MAX_RESOURCE_SAMPLES,
): ResourceUsage[] {
  const history: ResourceUsage[] = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    history.push({
      pid,
      timestamp: now - (count - 1 - i) * 5_000,
      cpuPercent: Math.max(0, baseCpu + (Math.random() - 0.5) * 6),
      memoryMb: Math.max(0, baseMemoryMb + (Math.random() - 0.5) * 12),
      rssBytes: Math.max(0, baseRssBytes + (Math.random() - 0.5) * 10_000_000),
    });
  }
  return history;
}

/** 初始化演示数据 */
function seedDemoData(): void {
  const now = Date.now();

  const seeds: DemoProcess[] = [
    {
      id: 'demo-process-1',
      pid: 12345,
      name: 'cross-wms-server',
      state: 'running',
      startedAtMs: now - 3600_000,
      lastOutputAtMs: now - 5_000,
      restartCount: 0,
      uptimeMs: 3600_000,
      usage: { pid: 12345, timestamp: now, cpuPercent: 12.5, memoryMb: 156.8, rssBytes: 164_491_264 },
      health: 'healthy',
      command: 'node',
      args: ['dist/server/index.js'],
      cwd: '/opt/cross-wms',
    },
    {
      id: 'demo-process-2',
      pid: 12346,
      name: 'worker-queue',
      state: 'running',
      startedAtMs: now - 7200_000,
      lastOutputAtMs: now - 12_000,
      restartCount: 2,
      uptimeMs: 7200_000,
      usage: { pid: 12346, timestamp: now, cpuPercent: 4.2, memoryMb: 89.3, rssBytes: 93_660_160 },
      health: 'degraded',
      command: 'node',
      args: ['dist/worker.js', '--queue=default'],
      cwd: '/opt/cross-wms',
    },
    {
      id: 'demo-process-3',
      pid: undefined,
      name: 'cron-scheduler',
      state: 'crashed',
      startedAtMs: now - 86_400_000,
      lastOutputAtMs: now - 60_000,
      restartCount: 5,
      uptimeMs: 0,
      usage: { pid: 0, timestamp: now, cpuPercent: 0, memoryMb: 0, rssBytes: 0 },
      health: 'unhealthy',
      command: 'node',
      args: ['dist/cron.js'],
      cwd: '/opt/cross-wms',
    },
    {
      id: 'demo-process-4',
      pid: 12347,
      name: 'media-encoder',
      state: 'zombie',
      startedAtMs: now - 1800_000,
      lastOutputAtMs: now - 600_000,
      restartCount: 1,
      uptimeMs: 1800_000,
      usage: { pid: 12347, timestamp: now, cpuPercent: 0.1, memoryMb: 12.4, rssBytes: 13_008_896 },
      health: 'unknown',
      command: 'ffmpeg',
      args: ['-i', 'input.mp4', 'output.mp4'],
      cwd: '/tmp',
    },
    {
      id: 'demo-process-5',
      pid: undefined,
      name: 'migration-task',
      state: 'exited',
      startedAtMs: now - 14_400_000,
      lastOutputAtMs: now - 14_300_000,
      restartCount: 0,
      uptimeMs: 100_000,
      usage: { pid: 0, timestamp: now, cpuPercent: 0, memoryMb: 0, rssBytes: 0 },
      health: 'unknown',
      command: 'node',
      args: ['dist/migrate.js'],
      cwd: '/opt/cross-wms',
    },
  ];

  for (const p of seeds) {
    demoProcesses.set(p.id, p);

    // 演示健康检查历史
    const history: HealthCheckResult[] = [];
    const probeName = p.name.includes('server') ? 'http' : p.name.includes('queue') ? 'queue-depth' : 'liveness';
    for (let i = 0; i < 8; i++) {
      const ts = now - i * 30_000;
      let status: HealthStatus = 'healthy';
      if (p.state === 'crashed') status = 'unhealthy';
      else if (p.state === 'zombie' || p.state === 'exited') status = 'unknown';
      else if (p.health === 'degraded' && i < 3) status = 'degraded';

      history.push({
        name: probeName,
        status,
        durationMs: 8 + Math.floor(Math.random() * 30),
        timestamp: ts,
      });
    }
    healthHistory.set(p.id, history);

    // 演示资源历史
    resourceHistory.set(
      p.id,
      generateResourceHistory(
        p.usage?.cpuPercent ?? 0,
        p.usage?.memoryMb ?? 0,
        p.usage?.rssBytes ?? 0,
        p.pid ?? 0,
      ),
    );
  }

  logger.info(`[ProcessRoute] 已初始化 ${seeds.length} 条演示进程数据`);
}

seedDemoData();

// ===================== 辅助函数 =====================

/**
 * 合并 ProcessManager 真实数据与演示数据。
 *
 * 真实数据优先（同 id 时使用真实快照），补充演示字段 command/args/cwd。
 */
function listAllProcesses(): DemoProcess[] {
  try {
    const realSnapshots = getProcessManager().list();
    const realIds = new Set(realSnapshots.map((s) => s.id));
    const realList: DemoProcess[] = realSnapshots.map((s) => ({
      ...s,
      command: '',
      args: [],
    }));
    const demoList = Array.from(demoProcesses.values()).filter((p) => !realIds.has(p.id));
    return [...realList, ...demoList].sort((a, b) => b.startedAtMs - a.startedAtMs);
  } catch (err) {
    logger.warn(`[ProcessRoute] 读取 ProcessManager 失败，回退到演示数据: ${err}`);
    return Array.from(demoProcesses.values()).sort((a, b) => b.startedAtMs - a.startedAtMs);
  }
}

// ===================== 路由实现 =====================

/**
 * GET /api/process/list — 列出所有托管进程
 *
 * 返回：{ processes: DemoProcess[] }
 */
router.get('/list', (_req: Request, res: Response) => {
  try {
    const processes = listAllProcesses();
    res.json({ processes });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`[ProcessRoute] 获取进程列表失败: ${msg}`);
    res.status(500).json({ error: `获取进程列表失败: ${msg}` });
  }
});

/**
 * GET /api/process/:id — 获取单个进程详情
 *
 * 返回：{ process: DemoProcess }
 */
router.get('/:id', (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const process = demoProcesses.get(id);
    if (!process) {
      res.status(404).json({ error: `未找到进程: ${id}` });
      return;
    }
    res.json({ process });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `获取进程详情失败: ${msg}` });
  }
});

/**
 * POST /api/process/:id/restart — 重启进程
 *
 * 返回：{ process: DemoProcess }
 */
router.post('/:id/restart', (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const existing = demoProcesses.get(id);
    if (!existing) {
      res.status(404).json({ error: `未找到进程: ${id}` });
      return;
    }
    const now = Date.now();
    const newPid = Math.floor(Math.random() * 90000) + 10000;
    const restarted: DemoProcess = {
      ...existing,
      state: 'running',
      startedAtMs: now,
      lastOutputAtMs: now,
      uptimeMs: 0,
      restartCount: existing.restartCount + 1,
      pid: newPid,
      usage: { pid: newPid, timestamp: now, cpuPercent: 0, memoryMb: 0, rssBytes: 0 },
      health: 'unknown',
    };
    demoProcesses.set(id, restarted);

    // 重置资源历史
    resourceHistory.set(id, generateResourceHistory(0, 0, 0, newPid, 1));

    logger.info(`[ProcessRoute] 进程已重启: ${existing.name} (${id})`);
    res.json({ process: restarted });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `重启进程失败: ${msg}` });
  }
});

/**
 * POST /api/process/:id/stop — 停止进程
 *
 * 返回：{ process: DemoProcess }
 */
router.post('/:id/stop', (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const existing = demoProcesses.get(id);
    if (!existing) {
      res.status(404).json({ error: `未找到进程: ${id}` });
      return;
    }
    const now = Date.now();
    const stopped: DemoProcess = {
      ...existing,
      state: 'exited',
      pid: undefined,
      uptimeMs: Math.max(existing.uptimeMs, now - existing.startedAtMs),
      usage: {
        pid: 0,
        timestamp: now,
        cpuPercent: 0,
        memoryMb: 0,
        rssBytes: 0,
      },
      health: 'unknown',
    };
    demoProcesses.set(id, stopped);
    logger.info(`[ProcessRoute] 进程已停止: ${existing.name} (${id})`);
    res.json({ process: stopped });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `停止进程失败: ${msg}` });
  }
});

/**
 * GET /api/process/:id/health — 健康检查状态
 *
 * 返回：{ status: HealthStatus, history: HealthCheckResult[] }
 */
router.get('/:id/health', (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const process = demoProcesses.get(id);
    if (!process) {
      res.status(404).json({ error: `未找到进程: ${id}` });
      return;
    }
    const history = healthHistory.get(id) ?? [];
    res.json({ status: process.health ?? 'unknown', history });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `获取健康状态失败: ${msg}` });
  }
});

/**
 * GET /api/process/:id/resources — 资源使用情况（CPU/内存）
 *
 * 返回：{ current?: ResourceUsage, history: ResourceUsage[] }
 */
router.get('/:id/resources', (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const process = demoProcesses.get(id);
    if (!process) {
      res.status(404).json({ error: `未找到进程: ${id}` });
      return;
    }

    // 滚动追加一个最新样本（演示动态监控效果）
    const now = Date.now();
    const last = process.usage;
    const newSample: ResourceUsage = {
      pid: process.pid ?? 0,
      timestamp: now,
      cpuPercent: last ? Math.max(0, last.cpuPercent + (Math.random() - 0.5) * 4) : 0,
      memoryMb: last ? Math.max(0, last.memoryMb + (Math.random() - 0.5) * 8) : 0,
      rssBytes: last ? Math.max(0, last.rssBytes + (Math.random() - 0.5) * 5_000_000) : 0,
    };
    process.usage = newSample;

    const history = resourceHistory.get(id) ?? [];
    history.push(newSample);
    while (history.length > MAX_RESOURCE_SAMPLES) history.shift();
    resourceHistory.set(id, history);

    res.json({ current: newSample, history });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `获取资源使用失败: ${msg}` });
  }
});

export default router;

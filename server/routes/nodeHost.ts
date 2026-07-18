/**
 * 节点主机 REST API 路由 — 节点信息、工具调用、队列与资源监控
 *
 * 提供以下端点：
 * GET   /api/node-host/info                 → 节点主机信息
 * GET   /api/node-host/tools                → 已注册工具列表
 * POST  /api/node-host/tools/:name/invoke   → 调用工具
 * GET   /api/node-host/queue                → 调用队列状态
 * GET   /api/node-host/resources            → 资源监控
 *
 * 实现说明：
 * - 节点信息使用本机 process 信息（hostname / pid / platform / node 版本）
 * - 工具列表合并 engine/node-host/tool-registry 的真实注册与演示数据
 * - 工具调用优先走 toolRegistry 真实 handler；未注册时返回演示结果
 * - 队列与资源监控为进程内动态状态，模拟实时变化
 */

import { Router, type Request, type Response } from 'express';
import os from 'node:os';
import { logger } from '../logger.js';
import { toolRegistry } from '../engine/node-host/index.js';
import type { ToolDefinition } from '../engine/node-host/index.js';

const router = Router();

// ===================== 节点常量 =====================

const STARTED_AT_MS = Date.now();
const NODE_PID = process.pid;
const HOSTNAME = os.hostname();
const PLATFORM = `${process.platform}/${process.arch}`;
const NODE_VERSION = process.version;
const NODE_VERSION_LABEL = '1.0.0';
const NODE_ID = 'local-node-host';
const CAPABILITIES = ['shell', 'filesystem', 'network', 'process', 'database'];

// ===================== 演示工具数据 =====================

type ToolStatus = 'active' | 'disabled' | 'error';

interface DemoTool {
  name: string;
  description: string;
  category: string;
  version: string;
  status: ToolStatus;
  invokeCount: number;
  averageDurationMs: number;
  permissions: string[];
  inputSchema?: Record<string, unknown>;
}

const demoTools = new Map<string, DemoTool>();
const toolInvokeStats = new Map<string, { count: number; totalDurationMs: number }>();

function seedDemoData(): void {
  const tools: DemoTool[] = [
    {
      name: 'shell.exec',
      description: '在节点主机上执行 shell 命令',
      category: 'system',
      version: '1.0.0',
      status: 'active',
      invokeCount: 247,
      averageDurationMs: 158,
      permissions: ['execute:shell'],
      inputSchema: { command: 'string', args: 'string[]', cwd: 'string?' },
    },
    {
      name: 'file.read',
      description: '读取节点主机上的文件内容',
      category: 'filesystem',
      version: '1.2.0',
      status: 'active',
      invokeCount: 1024,
      averageDurationMs: 23,
      permissions: ['read:file'],
      inputSchema: { path: 'string', encoding: 'string?' },
    },
    {
      name: 'file.write',
      description: '将内容写入节点主机上的文件',
      category: 'filesystem',
      version: '1.2.0',
      status: 'active',
      invokeCount: 384,
      averageDurationMs: 41,
      permissions: ['write:file'],
      inputSchema: { path: 'string', content: 'string', append: 'boolean?' },
    },
    {
      name: 'process.list',
      description: '列出节点主机上运行的进程',
      category: 'system',
      version: '1.0.0',
      status: 'active',
      invokeCount: 56,
      averageDurationMs: 89,
      permissions: ['read:process'],
    },
    {
      name: 'http.fetch',
      description: '从节点主机发起 HTTP 请求',
      category: 'network',
      version: '2.0.0',
      status: 'active',
      invokeCount: 712,
      averageDurationMs: 412,
      permissions: ['network:http'],
      inputSchema: { url: 'string', method: 'string?', headers: 'object?', body: 'string?' },
    },
    {
      name: 'db.query',
      description: '执行 SQL 查询（仅读）',
      category: 'database',
      version: '1.1.0',
      status: 'disabled',
      invokeCount: 18,
      averageDurationMs: 67,
      permissions: ['read:db'],
    },
    {
      name: 'archive.zip',
      description: '将目录压缩为 zip 归档',
      category: 'filesystem',
      version: '0.9.0',
      status: 'error',
      invokeCount: 3,
      averageDurationMs: 0,
      permissions: ['write:file'],
    },
  ];
  for (const t of tools) {
    demoTools.set(t.name, t);
    toolInvokeStats.set(t.name, {
      count: t.invokeCount,
      totalDurationMs: t.invokeCount * t.averageDurationMs,
    });
  }
  logger.info(`[NodeHostRoute] 已初始化 ${tools.length} 个演示工具`);
}

seedDemoData();

// ===================== 队列状态（演示动态变化） =====================

let queuePending = 2;
let queueRunning = 1;
let queueCompleted = 1547;
let queueFailed = 23;
let queueTotalDurationMs = 1547 * 178;

/** 模拟队列状态的随机变化 */
function tickQueue(): void {
  if (Math.random() < 0.4) {
    const r = Math.random();
    if (r < 0.25 && queuePending > 0) {
      queuePending--;
      queueRunning++;
    } else if (r < 0.75 && queueRunning > 0) {
      queueRunning--;
      const duration = 100 + Math.random() * 500;
      queueTotalDurationMs += duration;
      if (Math.random() < 0.9) {
        queueCompleted++;
      } else {
        queueFailed++;
      }
    } else {
      queuePending += Math.floor(Math.random() * 3);
    }
  }
}

// ===================== 资源监控（演示历史） =====================

const MAX_RESOURCE_SAMPLES = 60;
const resourceHistory: Array<{
  timestamp: number;
  memoryBytes: number;
  cpuPercent: number;
  uptimeMs: number;
}> = [];

// 初始化历史样本
for (let i = 0; i < MAX_RESOURCE_SAMPLES; i++) {
  const ts = STARTED_AT_MS - (MAX_RESOURCE_SAMPLES - i) * 5_000;
  resourceHistory.push({
    timestamp: ts,
    memoryBytes: 80 * 1024 * 1024 + Math.random() * 40 * 1024 * 1024,
    cpuPercent: 5 + Math.random() * 25,
    uptimeMs: Math.max(0, ts - STARTED_AT_MS),
  });
}

// ===================== 路由实现 =====================

/**
 * GET /api/node-host/info — 节点主机信息
 *
 * 返回：NodeHostInfo
 */
router.get('/info', (_req: Request, res: Response) => {
  try {
    const now = Date.now();
    res.json({
      nodeId: NODE_ID,
      hostname: HOSTNAME,
      version: NODE_VERSION_LABEL,
      startedAtMs: STARTED_AT_MS,
      uptimeMs: now - STARTED_AT_MS,
      pid: NODE_PID,
      platform: PLATFORM,
      nodeVersion: NODE_VERSION,
      capabilities: CAPABILITIES,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `获取节点信息失败: ${msg}` });
  }
});

/**
 * GET /api/node-host/tools — 已注册工具列表
 *
 * 返回：{ tools: DemoTool[] }
 */
router.get('/tools', (_req: Request, res: Response) => {
  try {
    // 合并真实 toolRegistry 与 demo 数据（真实数据优先）
    const realTools = toolRegistry.list();
    const realNames = new Set(realTools.map((t) => t.name));
    const merged: DemoTool[] = [
      ...realTools.map((t: ToolDefinition) => {
        const stats = toolInvokeStats.get(t.name);
        return {
          name: t.name,
          description: t.description,
          category: t.category ?? 'general',
          version: t.version ?? '1.0.0',
          status: 'active' as ToolStatus,
          invokeCount: stats?.count ?? 0,
          averageDurationMs: stats && stats.count > 0 ? stats.totalDurationMs / stats.count : 0,
          permissions: t.permissions ?? [],
          inputSchema: t.inputSchema,
        };
      }),
      ...Array.from(demoTools.values()).filter((t) => !realNames.has(t.name)),
    ];
    res.json({ tools: merged });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `获取工具列表失败: ${msg}` });
  }
});

/**
 * POST /api/node-host/tools/:name/invoke — 调用工具
 *
 * Body: { input: Record<string, unknown> }
 * 返回：NodeHostToolInvokeResult
 */
router.post('/tools/:name/invoke', async (req: Request, res: Response) => {
  try {
    const name = req.params.name;
    const input = (req.body?.input ?? {}) as Record<string, unknown>;

    // 检查工具是否存在（先看 demo，再看真实 registry）
    const demoTool = demoTools.get(name);
    const realEntry = toolRegistry.get(name);

    if (!demoTool && !realEntry) {
      res.status(404).json({ error: `未找到工具: ${name}` });
      return;
    }

    // 状态校验：仅 demo 工具有 status 字段
    if (demoTool && demoTool.status === 'disabled') {
      res.status(400).json({ error: `工具 ${name} 已禁用` });
      return;
    }
    if (demoTool && demoTool.status === 'error') {
      res.status(500).json({ error: `工具 ${name} 处于错误状态` });
      return;
    }

    const startTime = Date.now();
    const invocationId = `inv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    let stdout = '';
    let stderr = '';
    let exitCode = 0;
    let success = true;
    let error: string | undefined;
    const timedOut = false;

    // 真实工具调用优先
    if (realEntry) {
      try {
        const result = await realEntry.handler(input, {
          invocationId,
          nodeId: NODE_ID,
          logger: {
            info: (...args: unknown[]) => logger.info(`[NodeHost:${name}]`, ...args),
            error: (...args: unknown[]) => logger.error(`[NodeHost:${name}]`, ...args),
            debug: (...args: unknown[]) => logger.debug(`[NodeHost:${name}]`, ...args),
          },
        });
        stdout = JSON.stringify(result, null, 2);
      } catch (err) {
        success = false;
        exitCode = 1;
        error = err instanceof Error ? err.message : String(err);
        stderr = error;
      }
    } else {
      // 演示模式：返回模拟结果（轻微延迟模拟执行）
      await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 200));
      stdout = JSON.stringify(
        {
          tool: name,
          input,
          result: 'ok (demo)',
          timestamp: Date.now(),
        },
        null,
        2,
      );
    }

    const durationMs = Date.now() - startTime;

    // 更新调用统计
    const stats = toolInvokeStats.get(name) ?? { count: 0, totalDurationMs: 0 };
    stats.count += 1;
    stats.totalDurationMs += durationMs;
    toolInvokeStats.set(name, stats);

    if (demoTool) {
      demoTool.invokeCount = stats.count;
      demoTool.averageDurationMs = stats.totalDurationMs / stats.count;
      demoTools.set(name, demoTool);
    }

    logger.info(`[NodeHostRoute] 工具调用 ${name} → ${success ? '成功' : '失败'}（${durationMs}ms）`);

    res.json({
      invocationId,
      success,
      exitCode,
      stdout,
      stderr,
      durationMs,
      timedOut,
      error,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `工具调用失败: ${msg}` });
  }
});

/**
 * GET /api/node-host/queue — 调用队列状态
 *
 * 返回：QueueStats
 */
router.get('/queue', (_req: Request, res: Response) => {
  try {
    tickQueue();
    const totalProcessed = queueCompleted + queueFailed;
    res.json({
      pending: queuePending,
      running: queueRunning,
      completed: queueCompleted,
      failed: queueFailed,
      totalProcessed,
      averageDurationMs: totalProcessed > 0 ? queueTotalDurationMs / totalProcessed : 0,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `获取队列状态失败: ${msg}` });
  }
});

/**
 * GET /api/node-host/resources — 资源监控
 *
 * 返回：{ current, history, limits }
 */
router.get('/resources', (_req: Request, res: Response) => {
  try {
    const now = Date.now();
    const memUsage = process.memoryUsage();
    // 简化 CPU 估算：基于演示基线 + 随机扰动
    const cpuPercent = 8 + Math.random() * 15;
    const snapshot = {
      timestamp: now,
      memoryBytes: memUsage.heapUsed,
      cpuPercent,
      uptimeMs: now - STARTED_AT_MS,
    };
    resourceHistory.push(snapshot);
    while (resourceHistory.length > MAX_RESOURCE_SAMPLES) {
      resourceHistory.shift();
    }
    res.json({
      current: snapshot,
      history: [...resourceHistory],
      limits: { maxMemoryMB: 2048, maxCpuPercent: 90 },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `获取资源监控失败: ${msg}` });
  }
});

export default router;

/**
 * Cron Gateway Methods
 * Cron 定时任务服务方法
 */

import type { GatewayMethodContext } from "./types.js";
import { registerGatewayMethod } from "./methodRegistry.js";

export interface CronJob {
  id: string;
  name: string;
  cronExpression: string;
  description?: string;
  sessionKey?: string;
  agent?: string;
  prompt: string;
  enabled: boolean;
  lastRunAt?: number;
  nextRunAt?: number;
  runCount: number;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

const cronJobs = new Map<string, CronJob>();

// 运行历史记录（内存存储，用于 cron.runs 查询）
interface CronRunRecord {
  id: string;
  jobId: string;
  jobName: string;
  triggeredAt: number;
}
const cronRunHistory: CronRunRecord[] = [];

// ========== Cron List ==========

async function cronList(params: unknown, _ctx: GatewayMethodContext) {
  const {
    enabledOnly = false,
    limit = 50,
    offset = 0,
  } = params as {
    enabledOnly?: boolean;
    limit?: number;
    offset?: number;
  };

  let jobs = Array.from(cronJobs.values());

  if (enabledOnly) {
    jobs = jobs.filter((j) => j.enabled);
  }

  jobs.sort((a, b) => b.createdAt - a.createdAt);
  const total = jobs.length;
  const sliced = jobs.slice(offset, offset + limit);

  return {
    ok: true,
    jobs: sliced,
    total,
    hasMore: offset + limit < total,
  };
}

// ========== Cron Get ==========

async function cronGet(params: unknown, _ctx: GatewayMethodContext) {
  const { id } = params as { id: string };
  const job = cronJobs.get(id);
  return {
    ok: true,
    job: job ?? null,
  };
}

// ========== Cron Create ==========

async function cronCreate(params: unknown, _ctx: GatewayMethodContext) {
  const {
    name,
    cronExpression,
    description,
    sessionKey,
    agent,
    prompt,
    enabled = true,
    metadata,
  } = params as {
    name: string;
    cronExpression: string;
    description?: string;
    sessionKey?: string;
    agent?: string;
    prompt: string;
    enabled?: boolean;
    metadata?: Record<string, unknown>;
  };

  if (!name || !cronExpression || !prompt) {
    return {
      ok: false,
      error: { code: "MISSING_PARAMS", message: "name, cronExpression, and prompt are required" },
    };
  }

  const now = Date.now();
  const id = `cron_${now}_${Math.random().toString(36).slice(2, 8)}`;

  const job: CronJob = {
    id,
    name,
    cronExpression,
    description,
    sessionKey,
    agent,
    prompt,
    enabled,
    runCount: 0,
    createdAt: now,
    updatedAt: now,
    metadata,
  };

  cronJobs.set(id, job);

  return {
    ok: true,
    job,
  };
}

// ========== Cron Update ==========

async function cronUpdate(params: unknown, _ctx: GatewayMethodContext) {
  const { id, ...updates } = params as {
    id: string;
    name?: string;
    cronExpression?: string;
    description?: string;
    prompt?: string;
    enabled?: boolean;
    metadata?: Record<string, unknown>;
  };

  const job = cronJobs.get(id);
  if (!job) {
    return { ok: false, error: { code: "NOT_FOUND", message: "Cron job not found" } };
  }

  const updated = {
    ...job,
    ...updates,
    updatedAt: Date.now(),
  };

  cronJobs.set(id, updated);

  return {
    ok: true,
    job: updated,
  };
}

// ========== Cron Delete ==========

async function cronDelete(params: unknown, _ctx: GatewayMethodContext) {
  const { id } = params as { id: string };
  const deleted = cronJobs.delete(id);
  return {
    ok: true,
    deleted,
  };
}

// ========== Cron Enable/Disable ==========

async function cronEnable(params: unknown, _ctx: GatewayMethodContext) {
  const { id, enabled = true } = params as { id: string; enabled?: boolean };

  const job = cronJobs.get(id);
  if (!job) {
    return { ok: false, error: { code: "NOT_FOUND", message: "Cron job not found" } };
  }

  job.enabled = enabled;
  job.updatedAt = Date.now();

  return {
    ok: true,
    job,
  };
}

// ========== Cron Trigger ==========

async function cronTrigger(params: unknown, _ctx: GatewayMethodContext) {
  const { id } = params as { id: string };

  const job = cronJobs.get(id);
  if (!job) {
    return { ok: false, error: { code: "NOT_FOUND", message: "Cron job not found" } };
  }

  job.lastRunAt = Date.now();
  job.runCount++;

  // 记录运行历史（供 cron.runs 查询）
  cronRunHistory.push({
    id: `run_${job.lastRunAt}_${Math.random().toString(36).slice(2, 6)}`,
    jobId: id,
    jobName: job.name,
    triggeredAt: job.lastRunAt,
  });
  // 限制历史长度，避免内存无限增长
  if (cronRunHistory.length > 1000) {
    cronRunHistory.splice(0, cronRunHistory.length - 1000);
  }

  return {
    ok: true,
    triggered: true,
    job,
  };
}

// ========== Cron Stats ==========

async function cronStats(_params: unknown, _ctx: GatewayMethodContext) {
  const jobs = Array.from(cronJobs.values());
  return {
    ok: true,
    total: jobs.length,
    enabled: jobs.filter((j) => j.enabled).length,
    disabled: jobs.filter((j) => !j.enabled).length,
    totalRuns: jobs.reduce((sum, j) => sum + j.runCount, 0),
  };
}

// ========== Cron Runs (运行历史) ==========

/**
 * cron.runs — 获取运行历史
 * 参数: { jobId?: string, limit?: number, offset?: number }
 */
async function cronRuns(params: unknown, _ctx: GatewayMethodContext) {
  const { jobId, limit = 50, offset = 0 } = params as {
    jobId?: string;
    limit?: number;
    offset?: number;
  };

  let runs = cronRunHistory;
  if (jobId) {
    runs = runs.filter((r) => r.jobId === jobId);
  }

  const total = runs.length;
  // 返回最近 limit 条记录（从末尾向前取，跳过 offset 条）
  const startIdx = Math.max(0, total - limit - offset);
  const endIdx = Math.max(startIdx, total - offset);
  const sliced = runs.slice(startIdx, endIdx).reverse();

  return {
    ok: true,
    runs: sliced,
    total,
    hasMore: offset + limit < total,
  };
}

/**
 * 注册所有 Cron 服务方法
 */
export function registerCronMethods(): void {
  registerGatewayMethod("cron.list", cronList);
  registerGatewayMethod("cron.get", cronGet);
  registerGatewayMethod("cron.create", cronCreate);
  registerGatewayMethod("cron.update", cronUpdate);
  registerGatewayMethod("cron.delete", cronDelete);
  registerGatewayMethod("cron.enable", cronEnable);
  registerGatewayMethod("cron.trigger", cronTrigger);
  registerGatewayMethod("cron.stats", cronStats);
  registerGatewayMethod("cron.runs", cronRuns);  // cron.runs — 新增，获取运行历史

  // ---- 兼容别名（openclaw 命名，复用现有处理函数）----
  registerGatewayMethod("cron.add", cronCreate);     // cron.add = cron.create 别名
  registerGatewayMethod("cron.remove", cronDelete);  // cron.remove = cron.delete 别名
  registerGatewayMethod("cron.run", cronTrigger);    // cron.run = cron.trigger 别名
  registerGatewayMethod("cron.status", cronStats);   // cron.status = cron.stats 别名
}

export { cronJobs };

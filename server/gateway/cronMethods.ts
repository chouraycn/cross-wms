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
}

export { cronJobs };

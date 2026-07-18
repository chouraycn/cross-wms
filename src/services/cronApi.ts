/**
 * Cron API — 前端调用后端 /api/cron 端点
 *
 * 暴露的接口：
 * - listCronJobs        列出所有 cron 任务
 * - getCronJob          获取单个任务
 * - createCronJob       创建任务
 * - updateCronJob       更新任务（局部合并）
 * - deleteCronJob       删除任务
 * - parseCronExpression 解析 cron 表达式（返回 nextRunAt / previousRunAt）
 * - runCronJobNow       触发立即运行（后端 CLI：cron run）
 *
 * 失败时抛 Error，前端组件可捕获并展示。
 */

import { API_BASE_URL } from '../constants/api';

const BASE_URL = API_BASE_URL;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** Cron 调度类型（仅展示用，具体结构与后端保持一致） */
export interface CronJobSchedule {
  kind: 'at' | 'every' | 'cron';
  at?: string | number;
  everyMs?: number;
  anchorMs?: number;
  expr?: string;
  tz?: string;
  staggerMs?: number;
}

export interface CronJobPayload {
  kind: 'systemEvent' | 'agentTurn' | 'command';
  text?: string;
  message?: string;
  argv?: string[];
}

export interface CronJobState {
  consecutiveErrors?: number;
  consecutiveSkipped?: number;
  nextRunAtMs?: number;
  lastRunAtMs?: number;
  lastRunStatus?: 'ok' | 'error' | 'skipped';
}

export interface CronJob {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  schedule: CronJobSchedule;
  sessionTarget: 'main' | 'isolated' | 'current' | `session:${string}`;
  wakeMode: 'next-heartbeat' | 'now';
  payload: CronJobPayload;
  agentId?: string;
  sessionKey?: string;
  createdAtMs: number;
  updatedAtMs: number;
  state?: CronJobState;
}

export interface CronParseResult {
  expression: string;
  timezone: string;
  nextRunAt: number;
  previousRunAt: number | null;
  nextRunAtIso: string;
  description: string;
}

export interface CronRunResult {
  success: boolean;
  jobId: string;
  startedAtMs: number;
  message?: string;
}

/** 列出所有 cron 任务 */
export async function listCronJobs(): Promise<CronJob[]> {
  const result = await request<{ success: boolean; data: CronJob[]; total: number }>('/api/cron');
  return result.data;
}

/** 获取单个 cron 任务 */
export async function getCronJob(id: string): Promise<CronJob> {
  const result = await request<{ success: boolean; data: CronJob }>(`/api/cron/${encodeURIComponent(id)}`);
  return result.data;
}

/** 创建 cron 任务 */
export async function createCronJob(payload: Partial<CronJob> & { cronExpression: string; name?: string; enabled?: boolean }): Promise<CronJob> {
  const result = await request<{ success: boolean; data: CronJob }>('/api/cron', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return result.data;
}

/** 更新 cron 任务（局部） */
export async function updateCronJob(id: string, patch: Partial<CronJob> & { cronExpression?: string }): Promise<CronJob> {
  const result = await request<{ success: boolean; data: CronJob }>(`/api/cron/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
  return result.data;
}

/** 删除 cron 任务 */
export async function deleteCronJob(id: string): Promise<void> {
  await request(`/api/cron/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** 解析 cron 表达式 */
export async function parseCronExpression(cron: string, timezone?: string, from?: string | number): Promise<CronParseResult> {
  const result = await request<{ success: boolean; data: CronParseResult }>('/api/cron/parse', {
    method: 'POST',
    body: JSON.stringify({ cron, timezone, from }),
  });
  return result.data;
}

/**
 * 触发指定 cron 任务立即运行。
 * 后端若无对应 HTTP 端点，会降级为通过 CLI 端点调用。
 */
export async function runCronJobNow(id: string): Promise<CronRunResult> {
  // 优先尝试 HTTP 端点（若后端实现）
  try {
    const result = await request<{ success: boolean; data: CronRunResult }>(
      `/api/cron/${encodeURIComponent(id)}/run`,
      { method: 'POST' },
    );
    return result.data;
  } catch {
    // 退化：调用 CLI 端点
    try {
      const result = await request<CronRunResult>('/api/cli/run', {
        method: 'POST',
        body: JSON.stringify({ command: 'cron', subcommand: 'run', args: [id] }),
      });
      return result;
    } catch (e) {
      throw new Error(`立即运行失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

/**
 * 蒸馏 / 重写 等流式任务的进程内事件存储 + SQLite 元数据持久化。
 *
 * 设计：
 * - 实时 SSE 事件存于进程内存（支持断点续传 snapshot(afterSeq)）。
 * - 任务「元数据」（状态/时间戳/错误/meta）落库 sd_stream_jobs，使任务状态与历史在进程重启后不丢失。
 * - 启动时 hydrateStreamJobs() 从库重建内存态，并把 in-flight（queued/running）任务标记为 interrupted。
 *
 * 与 StaffDeck backend/app/skills/stream_jobs.py 对齐：单进程，最多保留 200 个 live job。
 */

import * as sjDao from '../dao/staff/staffStreamJobDao.js';
import { DEFAULT_TENANT_ID } from '../db-staff.js';

export type StreamJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export type StreamJobEvent = {
  seq: number;
  event: string;
  data: any;
};

type StreamJob = {
  job_id: string;
  kind: string;
  tenant_id: string;
  status: StreamJobStatus;
  created_at: number;
  finished_at: number | null;
  error: string | null;
  meta: Record<string, any>;
  events: StreamJobEvent[];
  cancelled: boolean;
};

const MAX_JOBS = 200;
const jobs = new Map<string, StreamJob>();
let hydrated = false;

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function persist(job: StreamJob): void {
  try {
    sjDao.upsertStreamJob({
      job_id: job.job_id,
      tenant_id: job.tenant_id,
      kind: job.kind,
      status: job.status,
      meta_json: JSON.stringify(job.meta ?? {}),
      error: job.error,
      created_at: job.created_at,
      finished_at: job.finished_at,
      updated_at: nowSec(),
    });
  } catch (e) {
    // 持久化失败不应阻断实时 SSE 链路
    // eslint-disable-next-line no-console
    console.error('[streamJobs] persist failed', e);
  }
}

export function createJob(kind: string, meta: Record<string, any> = {}): string {
  const jobId = genId(kind);
  const now = Math.floor(Date.now());
  const job: StreamJob = {
    job_id: jobId,
    kind,
    tenant_id: DEFAULT_TENANT_ID,
    status: 'queued',
    created_at: now,
    finished_at: null,
    error: null,
    meta,
    events: [],
    cancelled: false,
  };
  jobs.set(jobId, job);
  persist(job);
  if (jobs.size > MAX_JOBS) {
    const oldest = [...jobs.values()].sort((a, b) => a.created_at - b.created_at)[0];
    if (oldest) jobs.delete(oldest.job_id);
  }
  return jobId;
}

export function append(jobId: string, event: string, data: any): void {
  const job = jobs.get(jobId);
  if (!job) return;
  const wasQueued = job.status === 'queued';
  job.events.push({ seq: job.events.length + 1, event, data });
  if (wasQueued) {
    job.status = 'running';
    persist(job); // 仅状态翻转时落库，避免每个事件都写库
  }
}

export function complete(jobId: string): void {
  const job = jobs.get(jobId);
  if (!job || job.status === 'completed') return;
  job.status = 'completed';
  job.finished_at = Date.now();
  persist(job);
}

export function fail(jobId: string, error: string): void {
  const job = jobs.get(jobId);
  if (!job) return;
  job.status = 'failed';
  job.error = error;
  job.finished_at = Date.now();
  job.events.push({ seq: job.events.length + 1, event: 'job_complete', data: { status: 'failed', error } });
  persist(job);
}

export function cancel(jobId: string): boolean {
  const job = jobs.get(jobId);
  if (!job) return false;
  if (job.status === 'completed' || job.status === 'failed') return false;
  job.cancelled = true;
  job.status = 'cancelled';
  job.finished_at = Date.now();
  job.events.push({ seq: job.events.length + 1, event: 'job_complete', data: { status: 'cancelled' } });
  persist(job);
  return true;
}

export function isCancelled(jobId: string): boolean {
  return jobs.get(jobId)?.cancelled ?? false;
}

export function isDone(jobId: string): boolean {
  const s = jobs.get(jobId)?.status;
  return s === 'completed' || s === 'failed' || s === 'cancelled';
}

export function getJob(jobId: string): StreamJob | null {
  return jobs.get(jobId) ?? null;
}

export function snapshot(jobId: string, afterSeq = 0): StreamJobEvent[] {
  const job = jobs.get(jobId);
  if (!job) return [];
  return job.events.filter((e) => e.seq > afterSeq);
}

/** 启动 hydrate：从 SQLite 重建内存态（仅元数据，事件留空），in-flight 任务标记为 interrupted。 */
export function hydrateStreamJobs(): void {
  if (hydrated) return;
  hydrated = true;
  try {
    const rows = sjDao.loadAllStreamJobRows();
    const interrupted: string[] = [];
    for (const r of rows) {
      const isTerminal = r.status === 'completed' || r.status === 'failed' || r.status === 'cancelled';
      jobs.set(r.job_id, {
        job_id: r.job_id,
        kind: r.kind,
        tenant_id: r.tenant_id,
        status: r.status as StreamJobStatus,
        created_at: r.created_at,
        finished_at: r.finished_at,
        error: r.error,
        meta: safeParseMeta(r.meta_json),
        events: [],
        cancelled: r.status === 'cancelled',
      });
      if (!isTerminal) interrupted.push(r.job_id);
    }
    if (interrupted.length > 0) {
      sjDao.markJobsInterrupted(interrupted, 'interrupted by server restart');
      for (const id of interrupted) {
        const j = jobs.get(id);
        if (j) {
          j.status = 'failed';
          j.error = 'interrupted by server restart';
          j.finished_at = Date.now();
        }
      }
      // eslint-disable-next-line no-console
      console.info(`[streamJobs] hydrated ${rows.length} jobs, ${interrupted.length} marked interrupted`);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[streamJobs] hydrate failed', e);
  }
}

function safeParseMeta(s: string | null): Record<string, any> {
  if (!s) return {};
  try {
    const v = JSON.parse(s);
    return typeof v === 'object' && v !== null ? (v as Record<string, any>) : {};
  } catch {
    return {};
  }
}

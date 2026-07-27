/**
 * 流式蒸馏/重写任务的持久化 DAO。
 *
 * 职责：仅持久化任务「元数据」（job_id / kind / status / error / 时间戳 / meta）。
 * 实时 SSE 事件仍由进程内的 streamJobs 模块管理（内存），重启后事件不可回放，
 * 但任务状态与历史可在重启后查询，避免任务列表在重启后变空、且 in-flight 任务被标记为 interrupted。
 */

import { initDb } from '../../db.js';
import { DEFAULT_TENANT_ID } from '../../db-staff.js';

export type StreamJobRow = {
  job_id: string;
  tenant_id: string;
  kind: string;
  status: string;
  meta_json: string;
  error: string | null;
  created_at: number;
  finished_at: number | null;
  updated_at: number;
};

export type StreamJobUpsert = {
  job_id: string;
  tenant_id?: string;
  kind: string;
  status: string;
  meta_json?: string;
  error?: string | null;
  created_at: number;
  finished_at?: number | null;
  updated_at: number;
};

/** 写入或覆盖一条任务元数据（INSERT OR REPLACE）。 */
export function upsertStreamJob(input: StreamJobUpsert): void {
  const db = initDb();
  db.prepare(
    `INSERT OR REPLACE INTO sd_stream_jobs
       (job_id, tenant_id, kind, status, meta_json, error, created_at, finished_at, updated_at)
     VALUES (@job_id, @tenant_id, @kind, @status, @meta_json, @error, @created_at, @finished_at, @updated_at)`,
  ).run({
    job_id: input.job_id,
    tenant_id: input.tenant_id ?? DEFAULT_TENANT_ID,
    kind: input.kind,
    status: input.status,
    meta_json: input.meta_json ?? '{}',
    error: input.error ?? null,
    created_at: input.created_at,
    finished_at: input.finished_at ?? null,
    updated_at: input.updated_at,
  });
}

/** 仅更新任务终态（完成 / 失败 / 取消）。 */
export function patchStreamJobStatus(
  jobId: string,
  status: string,
  opts: { error?: string | null; finished_at?: number | null; updated_at?: number } = {},
): void {
  const db = initDb();
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    `UPDATE sd_stream_jobs
       SET status = @status, error = @error, finished_at = @finished_at, updated_at = @updated_at
     WHERE job_id = @job_id`,
  ).run({
    job_id: jobId,
    status,
    error: opts.error ?? null,
    finished_at: opts.finished_at ?? null,
    updated_at: opts.updated_at ?? now,
  });
}

export function getStreamJobRow(jobId: string): StreamJobRow | undefined {
  const db = initDb();
  return db.prepare('SELECT * FROM sd_stream_jobs WHERE job_id = ?').get(jobId) as
    | StreamJobRow
    | undefined;
}

/** 按租户列出最近任务（默认最近 100 条），用于前端任务历史。 */
export function listStreamJobRows(tenantId: string = DEFAULT_TENANT_ID, limit = 100): StreamJobRow[] {
  const db = initDb();
  return db
    .prepare(
      'SELECT * FROM sd_stream_jobs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?',
    )
    .all(tenantId, limit) as StreamJobRow[];
}

/** 加载全部任务行（用于启动 hydrate，重建内存态）。 */
export function loadAllStreamJobRows(): StreamJobRow[] {
  const db = initDb();
  return db.prepare('SELECT * FROM sd_stream_jobs').all() as StreamJobRow[];
}

/** 将一批未终态的任务标记为 failed（interrupted）——进程重启后 in-flight 任务已无法继续。 */
export function markJobsInterrupted(jobIds: string[], errorMsg: string): void {
  if (jobIds.length === 0) return;
  const db = initDb();
  const now = Math.floor(Date.now() / 1000);
  const stmt = db.prepare(
    `UPDATE sd_stream_jobs
       SET status = 'failed', error = @error, finished_at = @finished_at, updated_at = @updated_at
     WHERE job_id = @job_id AND status NOT IN ('completed','failed','cancelled')`,
  );
  const tx = db.transaction((ids: string[]) => {
    for (const id of ids) {
      stmt.run({ job_id: id, error: errorMsg, finished_at: now, updated_at: now });
    }
  });
  tx(jobIds);
}

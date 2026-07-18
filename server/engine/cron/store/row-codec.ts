/**
 * Cron Store Row Codec - 行编解码
 *
 * 在公共存储形状和规范化行格式之间转换 cron 任务。
 * 适配 JSON 文件存储的编解码层。
 */

import type { CronJob, CronJobState, CronSchedule, CronStoreFile } from "../types.js";
import { encodeDelivery, decodeDelivery } from "./delivery-codec.js";
import { encodeFailureAlert, decodeFailureAlert } from "./failure-alert-codec.js";
import { encodePayload, decodePayload } from "./payload-codec.js";
import {
  booleanToInteger,
  integerToBoolean,
  normalizeNumber,
  parseJsonObject,
} from "./scalar-codec.js";
import { encodeState, decodeState } from "./state-codec.js";
import type { LoadedCronStore } from "./types.js";

/**
 * 将调度配置编码为扁平列
 */
function encodeScheduleColumns(
  schedule: CronSchedule,
): Record<string, unknown> {
  if (schedule.kind === "at") {
    return {
      schedule_kind: "at",
      at: schedule.at,
      every_ms: null,
      anchor_ms: null,
      schedule_expr: null,
      schedule_tz: null,
      stagger_ms: null,
    };
  }
  if (schedule.kind === "every") {
    return {
      schedule_kind: "every",
      at: null,
      every_ms: schedule.everyMs,
      anchor_ms: schedule.anchorMs ?? null,
      schedule_expr: null,
      schedule_tz: null,
      stagger_ms: null,
    };
  }
  return {
    schedule_kind: "cron",
    at: null,
    every_ms: null,
    anchor_ms: null,
    schedule_expr: schedule.expr,
    schedule_tz: schedule.tz ?? null,
    stagger_ms: schedule.staggerMs ?? null,
  };
}

/**
 * 从行记录中重建调度配置
 */
function decodeSchedule(row: Record<string, unknown>): CronSchedule | null {
  const scheduleObj = row.schedule && typeof row.schedule === "object" ? row.schedule as Record<string, unknown> : null;
  const kind = row.schedule_kind ?? scheduleObj?.kind;
  if (kind === "at" && row.at) {
    return { kind: "at", at: row.at as string | number };
  }
  if (kind === "every" && row.every_ms != null) {
    return {
      kind: "every",
      everyMs: normalizeNumber(row.every_ms as number) ?? 0,
      ...(row.anchor_ms != null ? { anchorMs: normalizeNumber(row.anchor_ms as number) } : {}),
    };
  }
  if (kind === "cron" && row.schedule_expr) {
    return {
      kind: "cron",
      expr: String(row.schedule_expr),
      ...(row.schedule_tz ? { tz: String(row.schedule_tz) } : {}),
      ...(row.stagger_ms != null ? { staggerMs: normalizeNumber(row.stagger_ms as number) } : {}),
    };
  }
  if (row.schedule && typeof row.schedule === "object") {
    return row.schedule as CronSchedule;
  }
  return null;
}

/**
 * 剥离任务运行时字段，只保留配置形状
 */
function stripJobRuntimeFields(job: CronStoreFile["jobs"][number]): Record<string, unknown> {
  const { state: _state, updatedAtMs: _updatedAtMs, ...rest } = job;
  return { ...rest, state: {} };
}

/**
 * 将 cron 任务编码为完整的行记录
 */
export function encodeCronJobRow(job: CronJob, sortOrder: number): Record<string, unknown> {
  return {
    job_id: job.id,
    name: job.name,
    description: job.description ?? null,
    enabled: job.enabled ? 1 : 0,
    delete_after_run: booleanToInteger(job.deleteAfterRun),
    created_at_ms: job.createdAtMs,
    updated_at: job.updatedAtMs,
    agent_id: job.agentId ?? null,
    session_key: job.sessionKey ?? null,
    session_target: job.sessionTarget,
    wake_mode: job.wakeMode,
    ...encodeScheduleColumns(job.schedule),
    ...encodePayload(job.payload),
    ...encodeDelivery(job.delivery),
    ...encodeFailureAlert(job.failureAlert),
    ...encodeState(job.state ?? {}),
    job_json: JSON.stringify(stripJobRuntimeFields(job)),
    runtime_updated_at_ms: job.updatedAtMs,
    sort_order: sortOrder,
  };
}

/**
 * 从行记录重建 cron 任务
 */
export function decodeCronJobRow(row: Record<string, unknown>): CronJob | null {
  const schedule = decodeSchedule(row);
  const payload = decodePayload(row);
  const delivery = decodeDelivery(row);
  const failureAlert = decodeFailureAlert(row);
  if (!schedule || !payload) {
    if (row.id && row.schedule && row.payload) {
      return row as unknown as CronJob;
    }
    return null;
  }
  const createdAtMs = normalizeNumber(row.created_at_ms as number) ?? Date.now();
  return {
    id: String(row.job_id ?? row.id),
    name: String(row.name),
    ...(row.description ? { description: String(row.description) } : {}),
    enabled: row.enabled !== 0,
    ...(row.delete_after_run != null
      ? { deleteAfterRun: integerToBoolean(row.delete_after_run as number) }
      : {}),
    createdAtMs,
    updatedAtMs:
      normalizeNumber(row.runtime_updated_at_ms as number) ??
      normalizeNumber(row.updated_at as number) ??
      createdAtMs,
    ...(row.agent_id ? { agentId: String(row.agent_id) } : {}),
    ...(row.session_key ? { sessionKey: String(row.session_key) } : {}),
    schedule,
    sessionTarget: row.session_target as CronJob["sessionTarget"],
    wakeMode: row.wake_mode as CronJob["wakeMode"],
    payload,
    ...(delivery ? { delivery } : {}),
    ...(failureAlert !== undefined ? { failureAlert } : {}),
    state: decodeState(row),
  };
}

/**
 * 从原始 JSON 加载的任务列表构造 LoadedCronStore
 */
export function loadedCronStoreFromJson(jobs: unknown[]): LoadedCronStore {
  const parsedJobs = jobs.map((job) => {
    if (typeof job === "object" && job !== null) {
      return decodeCronJobRow(job as Record<string, unknown>) ?? (job as CronJob);
    }
    return null;
  });
  const validJobs = parsedJobs.filter((job): job is CronJob => job !== null);
  const configJobs = jobs.map((job, index) => {
    const parsed = parsedJobs[index];
    if (parsed && typeof job === "object" && job !== null) {
      const { state: _state, ...rest } = job as Record<string, unknown>;
      return rest;
    }
    return typeof job === "object" && job !== null ? (job as Record<string, unknown>) : {};
  });
  const configJobRuntimeEntries = jobs.map((job) => {
    if (typeof job === "object" && job !== null) {
      const record = job as Record<string, unknown>;
      const state = record.state;
      return {
        updatedAtMs: typeof record.updatedAtMs === "number" ? record.updatedAtMs : undefined,
        state: state && typeof state === "object" ? (state as Record<string, unknown>) : {},
      };
    }
    return { state: {} };
  });
  return {
    store: { version: 1, jobs: validJobs },
    configJobs,
    configJobIndexes: jobs.map((_, index) => index),
    configJobRuntimeEntries,
    invalidConfigRows: [],
  };
}

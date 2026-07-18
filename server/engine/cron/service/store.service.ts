/**
 * Cron Service Store - 存储服务层
 *
 * 加载、规范化、隔离和持久化 cron 服务存储状态。
 * 与底层存储交互，维护内存中的 active-jobs 缓存。
 */

import type { CronServiceState } from "./state.js";
import { recomputeNextRuns } from "./jobs.js";
import { JsonCronJobStore, getDefaultCronStore, type CronQuarantineEntry } from "../store.js";
import type { CronJob, CronStoreFile } from "../types.js";
import { loadedCronStoreFromJson } from "../store/row-codec.js";

/**
 * 警告无效的持久化 cron 任务
 */
function warnInvalidPersistedCronJob(params: {
  state: CronServiceState;
  raw: Record<string, unknown>;
  index: number;
  reason: string;
}): void {
  const jobId = typeof params.raw.id === "string" ? params.raw.id : undefined;
  const dedupeKey = jobId ?? `index:${params.index}`;
  if (params.state.warnedInvalidPersistedJobKeys.has(dedupeKey)) {
    return;
  }
  params.state.warnedInvalidPersistedJobKeys.add(dedupeKey);
  params.state.deps.log.warn(
    {
      storePath: params.state.deps.storePath,
      jobId,
      jobIndex: params.index,
      reason: params.reason,
    },
    "cron: quarantined invalid persisted job and skipped it from runtime",
  );
}

/**
 * 验证 cron 任务是否为有效的持久化形状
 */
function getInvalidPersistedCronJobReason(raw: Record<string, unknown>): string | null {
  if (typeof raw.id !== "string" || !raw.id.trim()) {
    return "missing or invalid id";
  }
  if (typeof raw.name !== "string" || !raw.name.trim()) {
    return "missing or invalid name";
  }
  if (!raw.schedule || typeof raw.schedule !== "object") {
    return "missing schedule";
  }
  const schedule = raw.schedule as Record<string, unknown>;
  if (typeof schedule.kind !== "string") {
    return "missing schedule.kind";
  }
  if (typeof raw.sessionTarget !== "string") {
    return "missing sessionTarget";
  }
  if (typeof raw.wakeMode !== "string") {
    return "missing wakeMode";
  }
  if (!raw.payload || typeof raw.payload !== "object") {
    return "missing payload";
  }
  const payload = raw.payload as Record<string, unknown>;
  if (typeof payload.kind !== "string") {
    return "missing payload.kind";
  }
  if (typeof raw.enabled !== "boolean") {
    return "missing or invalid enabled";
  }
  if (typeof raw.createdAtMs !== "number") {
    return "missing or invalid createdAtMs";
  }
  if (typeof raw.updatedAtMs !== "number") {
    return "missing or invalid updatedAtMs";
  }
  return null;
}

/**
 * 刷新待处理的隔离记录
 */
export async function flushPendingQuarantine(
  state: CronServiceState,
  nowMs: number,
): Promise<string | null> {
  if (state.pendingQuarantineConfigJobs.length === 0) {
    return null;
  }
  try {
    const store = state.deps.storePath
      ? new JsonCronJobStore(state.deps.storePath)
      : getDefaultCronStore();
    const quarantine = await store.loadQuarantine();
    const nextJobs = [...quarantine.jobs];
    const seen = new Set(nextJobs.map((e) => JSON.stringify({ id: e.job?.id, reason: e.reason, sourceIndex: e.sourceIndex })));
    for (const entry of state.pendingQuarantineConfigJobs) {
      const key = JSON.stringify({ id: entry.job?.id, reason: entry.reason, sourceIndex: entry.sourceIndex });
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      nextJobs.push({
        ...entry,
        quarantinedAtMs: nowMs,
      });
    }
    await store.saveQuarantine({ version: 1, jobs: nextJobs });
    state.pendingQuarantineConfigJobs = [];
    state.lastQuarantineFailureWarnKey = null;
    return store.getQuarantinePath();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const warnKey = `${state.deps.storePath}\0${errorMessage}`;
    if (state.lastQuarantineFailureWarnKey !== warnKey) {
      state.lastQuarantineFailureWarnKey = warnKey;
      state.deps.log.warn(
        {
          storePath: state.deps.storePath,
          error: errorMessage,
        },
        "cron: failed to quarantine malformed persisted jobs; skipping active store sanitization",
      );
    }
    return null;
  }
}

/**
 * 加载并规范化 cron 存储，在运行时使用之前隔离无效的持久化行
 */
export async function ensureLoaded(
  state: CronServiceState,
  opts?: {
    forceReload?: boolean;
    /** 加载后跳过重新计算 nextRunAtMs，以便调用者可以先根据持久化值运行到期的任务 */
    skipRecompute?: boolean;
  },
): Promise<void> {
  if (state.store && !opts?.forceReload) {
    return;
  }
  const previousJobsById = new Map<string, CronJob>();
  for (const job of state.store?.jobs ?? []) {
    previousJobsById.set(job.id, job);
  }

  const store = state.deps.storePath
    ? new JsonCronJobStore(state.deps.storePath)
    : getDefaultCronStore();
  const loaded = await store.load();
  const loadedJobs = loaded.store.jobs as unknown as Record<string, unknown>[];
  const jobs: CronJob[] = [];
  const nowMs = state.deps.nowMs();
  const quarantinedConfigJobs: CronQuarantineEntry[] = [...loaded.invalidConfigRows];

  for (const [index, raw] of loadedJobs.entries()) {
    const invalidReason = getInvalidPersistedCronJobReason(raw);
    if (invalidReason) {
      const quarantineEntry: CronQuarantineEntry = {
        quarantinedAtMs: nowMs,
        sourceIndex: index,
        reason: invalidReason,
        job: raw as Partial<CronJob>,
      };
      const runtimeState = raw.state;
      if (runtimeState && typeof runtimeState === "object" && !Array.isArray(runtimeState)) {
        quarantineEntry.state = structuredClone(runtimeState as Record<string, unknown>);
      }
      if (typeof raw.updatedAtMs === "number" && Number.isFinite(raw.updatedAtMs)) {
        quarantineEntry.updatedAtMs = raw.updatedAtMs;
      }
      quarantinedConfigJobs.push(quarantineEntry);
      warnInvalidPersistedCronJob({ state, raw, index, reason: invalidReason });
      continue;
    }
    const hydrated = raw as unknown as CronJob;
    jobs.push(hydrated);
  }

  const loadedResult = loadedCronStoreFromJson(jobs as unknown as unknown[]);
  state.store = {
    version: 1,
    jobs: loadedResult.store.jobs,
  };
  state.storeLoadedAtMs = state.deps.nowMs();

  if (quarantinedConfigJobs.length > 0) {
    state.pendingQuarantineConfigJobs = quarantinedConfigJobs;
    const quarantinePath = await flushPendingQuarantine(state, state.storeLoadedAtMs);
    if (quarantinePath) {
      try {
        const storeFile: CronStoreFile = { version: 1, jobs: state.store.jobs };
        await store.save(storeFile);
        state.deps.log.warn(
          {
            storePath: state.deps.storePath,
            quarantinePath,
            quarantinedJobs: quarantinedConfigJobs.length,
          },
          "cron: sanitized active cron store after quarantining malformed persisted jobs",
        );
      } catch (error) {
        state.deps.log.warn(
          {
            storePath: state.deps.storePath,
            error: error instanceof Error ? error.message : String(error),
          },
          "cron: failed to sanitize malformed persisted jobs after quarantine; continuing with quarantined in-memory view",
        );
      }
    }
  }

  if (!opts?.skipRecompute) {
    recomputeNextRuns({
      jobs: state.store.jobs,
      nowMs: state.deps.nowMs(),
      log: state.deps.log,
    });
  }
}

/**
 * 如果 cron 被禁用，发出一次警告
 */
export function warnIfDisabled(state: CronServiceState, action: string): void {
  if (state.deps.cronEnabled) {
    return;
  }
  if (state.warnedDisabled) {
    return;
  }
  state.warnedDisabled = true;
  state.deps.log.warn(
    { enabled: false, action, storePath: state.deps.storePath },
    "cron: scheduler disabled; jobs will not run automatically",
  );
}

/**
 * 持久化内存中的 cron 存储，先刷新待处理的隔离记录
 */
export async function persist(state: CronServiceState, opts?: { stateOnly?: boolean }): Promise<void> {
  if (!state.store) {
    return;
  }
  let flushedPendingQuarantine = false;
  if (state.pendingQuarantineConfigJobs.length > 0) {
    const quarantinePath = await flushPendingQuarantine(state, state.deps.nowMs());
    if (!quarantinePath) {
      return;
    }
    flushedPendingQuarantine = true;
  }
  const store = state.deps.storePath
    ? new JsonCronJobStore(state.deps.storePath)
    : getDefaultCronStore();
  await store.save(state.store);
}

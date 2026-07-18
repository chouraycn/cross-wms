/**
 * Cron Active Jobs - 活跃任务管理
 *
 * 跟踪进程内的 cron 执行，避免调度器和唤醒路径重复运行。
 * 使用进程全局单例状态，支持模块重载场景下的状态保持。
 */

type CronActiveJobState = {
  activeJobs: Map<string, CronActiveJobMarker>;
  generation: number;
  nextToken: number;
  emptyWaiters: Set<() => void>;
  activeJobIds?: Set<string>;
};

const CRON_ACTIVE_JOB_STATE_KEY = Symbol.for("crosswms.cron.activeJobs");

export type CronActiveJobMarker = {
  jobId: string;
  generation: number;
  token: number;
  legacy?: boolean;
  preserveAcrossGenerationAdvance?: boolean;
};

function getCronActiveJobState(): CronActiveJobState {
  const global = globalThis as unknown as Record<symbol, CronActiveJobState | undefined>;
  let state = global[CRON_ACTIVE_JOB_STATE_KEY];
  if (!state) {
    state = {
      activeJobs: new Map<string, CronActiveJobMarker>(),
      generation: 0,
      nextToken: 1,
      emptyWaiters: new Set<() => void>(),
      activeJobIds: new Set<string>(),
    };
    global[CRON_ACTIVE_JOB_STATE_KEY] = state;
  }
  state.generation ??= 0;
  state.nextToken ??= 1;
  state.activeJobs ??= new Map<string, CronActiveJobMarker>();
  state.emptyWaiters ??= new Set<() => void>();
  state.activeJobIds ??= new Set<string>();
  if (state.activeJobIds) {
    for (const [jobId, marker] of state.activeJobs) {
      if (marker.legacy === true && !state.activeJobIds.has(jobId)) {
        state.activeJobs.delete(jobId);
      }
    }
    for (const jobId of state.activeJobIds) {
      if (!state.activeJobs.has(jobId)) {
        state.activeJobs.set(jobId, {
          jobId,
          generation: state.generation,
          token: state.nextToken,
          legacy: true,
        });
        state.nextToken += 1;
      }
    }
  }
  return state;
}

function getActiveCronJobCountForGeneration(state: CronActiveJobState) {
  let active = 0;
  for (const marker of state.activeJobs.values()) {
    if (isMarkerActiveInGeneration(marker, state.generation)) {
      active += 1;
    }
  }
  return active;
}

function isMarkerActiveInGeneration(marker: CronActiveJobMarker, generation: number) {
  return marker.generation === generation || marker.preserveAcrossGenerationAdvance === true;
}

function notifyActiveCronJobWaitersIfEmpty(state: CronActiveJobState) {
  if (getActiveCronJobCountForGeneration(state) > 0) {
    return;
  }
  for (const resolve of state.emptyWaiters) {
    resolve();
  }
  state.emptyWaiters.clear();
}

/**
 * 将 cron 任务 id 标记为当前正在执行，用于抑制重复运行
 */
export function markCronJobActive(
  jobId: string,
  opts?: { preserveAcrossGenerationAdvance?: boolean },
): CronActiveJobMarker | undefined {
  if (!jobId) {
    return undefined;
  }
  const state = getCronActiveJobState();
  const token = state.nextToken;
  state.nextToken += 1;
  const marker: CronActiveJobMarker = {
    jobId,
    generation: state.generation,
    token,
    ...(opts?.preserveAcrossGenerationAdvance ? { preserveAcrossGenerationAdvance: true } : {}),
  };
  state.activeJobs.set(jobId, marker);
  state.activeJobIds?.add(jobId);
  return marker;
}

/**
 * 当 cron 运行退出或被放弃时清除活跃标记
 */
export function clearCronJobActive(jobId: string, marker?: CronActiveJobMarker) {
  if (!jobId) {
    return;
  }
  const state = getCronActiveJobState();
  const activeMarker = state.activeJobs.get(jobId);
  if (
    activeMarker &&
    (!marker || (marker.jobId === jobId && marker.token === activeMarker.token))
  ) {
    state.activeJobs.delete(jobId);
    state.activeJobIds?.delete(jobId);
  }
  notifyActiveCronJobWaitersIfEmpty(state);
}

/**
 * 返回给定的 cron 任务 id 当前是否在此进程中执行
 */
export function isCronJobActive(jobId: string): boolean {
  if (!jobId) {
    return false;
  }
  const state = getCronActiveJobState();
  const marker = state.activeJobs.get(jobId);
  return marker ? isMarkerActiveInGeneration(marker, state.generation) : false;
}

export function isCronActiveJobMarkerCurrent(marker: CronActiveJobMarker | undefined): boolean {
  if (!marker) {
    return true;
  }
  const state = getCronActiveJobState();
  const activeMarker = state.activeJobs.get(marker.jobId);
  return (
    activeMarker?.token === marker.token && isMarkerActiveInGeneration(marker, state.generation)
  );
}

/**
 * 返回此进程中是否有任何 cron 运行处于活跃状态
 */
export function hasActiveCronJobs(): boolean {
  return getActiveCronJobCountForGeneration(getCronActiveJobState()) > 0;
}

/**
 * 返回此进程中活跃 cron 运行的数量
 */
export function getActiveCronJobCount(): number {
  return getActiveCronJobCountForGeneration(getCronActiveJobState());
}

export async function waitForActiveCronJobs(timeoutMs: number): Promise<{
  drained: boolean;
  active: number;
}> {
  const state = getCronActiveJobState();
  if (getActiveCronJobCountForGeneration(state) === 0) {
    return { drained: true, active: 0 };
  }
  await new Promise<void>((resolve) => {
    const waiter = () => {
      clearTimeout(timeout);
      resolve();
    };
    const timeout = setTimeout(
      () => {
        state.emptyWaiters.delete(waiter);
        resolve();
      },
      Math.max(0, Math.floor(timeoutMs)),
    );
    state.emptyWaiters.add(waiter);
  });
  const active = getActiveCronJobCountForGeneration(state);
  return {
    drained: active === 0,
    active,
  };
}

/**
 * 启动新的进程生命周期代，而不清除仍在完成的旧运行
 */
export function advanceCronActiveJobGeneration(): void {
  const state = getCronActiveJobState();
  state.generation += 1;
  for (const [jobId, marker] of state.activeJobs) {
    if (marker.preserveAcrossGenerationAdvance === true) {
      continue;
    }
    if (marker.generation < state.generation - 1) {
      state.activeJobs.delete(jobId);
      state.activeJobIds?.delete(jobId);
    }
  }
  notifyActiveCronJobWaitersIfEmpty(state);
}

/**
 * 在进程生命周期边界清除进程全局 cron 活跃任务状态
 */
export function resetCronActiveJobs(): void {
  const state = getCronActiveJobState();
  state.generation += 1;
  state.activeJobs.clear();
  state.activeJobIds?.clear();
  notifyActiveCronJobWaitersIfEmpty(state);
}

import { logger } from "../../../logger.js";
import { computeSkillStatus } from "../discovery/status.js";
import type { SkillStatusSummary } from "../discovery/status.js";
import { refreshSkills, getCachedSkills } from "./refresh.js";
import { buildSessionSkillSnapshot } from "./session-snapshot.js";
import type { SessionSkillSnapshot } from "./session-snapshot.js";

export const DEFAULT_SNAPSHOT_INTERVAL_MS = 300_000;
export const MIN_SNAPSHOT_INTERVAL_MS = 30_000;

export type SkillSnapshotConfig = {
  intervalMs: number;
  workspaceDir: string;
  agentId?: string;
};

export type SnapshotStats = {
  lastRefreshAt: number;
  refreshCount: number;
  totalSkills: number;
  eligibleSkills: number;
  durationMs: number;
};

export type ScheduledRefreshHandle = {
  id: string;
  stop(): void;
  isRunning(): boolean;
};

type SnapshotState = {
  lastSnapshot: SessionSkillSnapshot | null;
  lastStatus: SkillStatusSummary | null;
  stats: SnapshotStats;
  isRefreshing: boolean;
  timerId: ReturnType<typeof setInterval> | null;
  activeHandle: ScheduledRefreshHandle | null;
};

const state: SnapshotState = {
  lastSnapshot: null,
  lastStatus: null,
  stats: {
    lastRefreshAt: 0,
    refreshCount: 0,
    totalSkills: 0,
    eligibleSkills: 0,
    durationMs: 0,
  },
  isRefreshing: false,
  timerId: null,
  activeHandle: null,
};

let handleCounter = 0;

function generateHandleId(): string {
  handleCounter += 1;
  return `snapshot-cron-${handleCounter}-${Date.now()}`;
}

function normalizeInterval(intervalMs: number): number {
  if (intervalMs < MIN_SNAPSHOT_INTERVAL_MS) {
    logger.warn(
      `[CronSnapshot] Interval ${intervalMs}ms is below minimum ${MIN_SNAPSHOT_INTERVAL_MS}ms, using minimum`,
    );
    return MIN_SNAPSHOT_INTERVAL_MS;
  }
  return intervalMs;
}

async function refreshSnapshot(workspaceDir: string, agentId?: string): Promise<void> {
  if (state.isRefreshing) {
    logger.debug("[CronSnapshot] Skipping refresh - previous refresh still in progress");
    return;
  }

  state.isRefreshing = true;
  const startTime = Date.now();

  try {
    const result = await refreshSkills(workspaceDir);

    if (!result.success) {
      logger.warn("[CronSnapshot] Skill refresh reported failure");
      return;
    }

    const entries = getCachedSkills();
    const status = computeSkillStatus(entries);
    const snapshot = buildSessionSkillSnapshot(entries as any);

    state.lastSnapshot = snapshot;
    state.lastStatus = status;
    state.stats = {
      lastRefreshAt: Date.now(),
      refreshCount: state.stats.refreshCount + 1,
      totalSkills: status.total,
      eligibleSkills: status.promptVisible,
      durationMs: Date.now() - startTime,
    };

    logger.debug(
      `[CronSnapshot] Snapshot refreshed: ${status.total} total, ${status.promptVisible} eligible (${state.stats.durationMs}ms)`,
    );
  } catch (err) {
    logger.error("[CronSnapshot] Failed to refresh snapshot:", err);
  } finally {
    state.isRefreshing = false;
  }
}

export function startSkillSnapshotCron(config: SkillSnapshotConfig): ScheduledRefreshHandle {
  if (state.activeHandle) {
    logger.warn("[CronSnapshot] Stopping existing cron before starting new one");
    state.activeHandle.stop();
  }

  const intervalMs = normalizeInterval(config.intervalMs);
  const id = generateHandleId();
  let running = true;

  logger.info(
    `[CronSnapshot] Starting snapshot cron (id=${id}, interval=${intervalMs}ms, workspace=${config.workspaceDir})`,
  );

  const timerId = setInterval(() => {
    if (!running) return;
    void refreshSnapshot(config.workspaceDir, config.agentId);
  }, intervalMs);

  const handle: ScheduledRefreshHandle = {
    id,
    stop() {
      if (!running) return;
      running = false;
      if (state.timerId === timerId) {
        clearInterval(timerId);
        state.timerId = null;
      }
      if (state.activeHandle?.id === id) {
        state.activeHandle = null;
      }
      logger.info(`[CronSnapshot] Stopped snapshot cron (id=${id})`);
    },
    isRunning() {
      return running;
    },
  };

  state.timerId = timerId;
  state.activeHandle = handle;

  return handle;
}

export function stopSkillSnapshotCron(handle: ScheduledRefreshHandle): void {
  handle.stop();
}

export async function triggerManualRefresh(
  workspaceDir: string,
  agentId?: string,
): Promise<void> {
  logger.debug(`[CronSnapshot] Manual refresh triggered for workspace: ${workspaceDir}`);
  await refreshSnapshot(workspaceDir, agentId);
}

export function getSnapshotStats(): SnapshotStats {
  return { ...state.stats };
}

export function getLastSnapshot(): SessionSkillSnapshot | null {
  return state.lastSnapshot;
}

export function getLastStatus(): SkillStatusSummary | null {
  return state.lastStatus;
}

export function isRefreshing(): boolean {
  return state.isRefreshing;
}

export function resetCronSnapshotState(): void {
  if (state.activeHandle) {
    state.activeHandle.stop();
  }
  state.lastSnapshot = null;
  state.lastStatus = null;
  state.stats = {
    lastRefreshAt: 0,
    refreshCount: 0,
    totalSkills: 0,
    eligibleSkills: 0,
    durationMs: 0,
  };
  state.isRefreshing = false;
  state.timerId = null;
  state.activeHandle = null;
}

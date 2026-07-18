/**
 * Cron Service Wake - 唤醒机制
 *
 * 系统唤醒后重新计算定时器，检测系统休眠/唤醒，处理错过的任务。
 * 提供手动 cron 唤醒辅助函数，用于将系统事件排队到会话中。
 */

import type { CronServiceState } from "./state.js";
import { armTimer } from "./timer.js";
import { ensureLoaded } from "./store.service.js";

/**
 * 系统休眠检测的阈值（毫秒）
 * 如果两次定时器触发之间的实际时间差超过预期延迟加上此阈值，则认为系统曾休眠
 */
const SLEEP_DETECTION_THRESHOLD_MS = 60_000;

/**
 * 唤醒机制状态
 */
type WakeState = {
  lastTickAt: number | null;
  expectedDelay: number | null;
};

const wakeState: WakeState = {
  lastTickAt: null,
  expectedDelay: null,
};

/**
 * 记录定时器启动，用于后续检测系统休眠
 */
export function recordTimerStart(expectedDelayMs: number, nowMs: number): void {
  wakeState.lastTickAt = nowMs;
  wakeState.expectedDelay = expectedDelayMs;
}

/**
 * 检测系统是否从休眠中唤醒
 */
export function detectWake(nowMs: number): boolean {
  if (wakeState.lastTickAt === null || wakeState.expectedDelay === null) {
    return false;
  }
  const actualDelay = nowMs - wakeState.lastTickAt;
  const expectedDelay = wakeState.expectedDelay;
  return actualDelay > expectedDelay + SLEEP_DETECTION_THRESHOLD_MS;
}

/**
 * 处理系统唤醒事件
 * 重新计算所有任务的调度并重新武装定时器
 */
export async function handleSystemWake(state: CronServiceState): Promise<void> {
  state.deps.log.info({}, "cron: system wake detected, recomputing schedules");
  try {
    await ensureLoaded(state, { forceReload: true });
    armTimer(state);
  } catch (err) {
      state.deps.log.error({ err: String(err) }, "cron: failed to handle system wake");
    }
}

/**
 * 手动 cron 唤醒辅助函数，用于将系统事件排队到会话中
 */
export function wake(
  state: CronServiceState,
  opts: {
    mode: "now" | "next-heartbeat";
    text: string;
    sessionKey?: string;
    agentId?: string;
  },
): { ok: boolean; reason?: string } {
  const text = opts.text.trim();
  if (!text) {
    return { ok: false };
  }
  const sessionKey = opts.sessionKey?.trim() || undefined;
  const agentId = opts.agentId?.trim() || undefined;

  if (state.deps.enqueueSystemEvent) {
    const enqueueOpts =
      sessionKey || agentId
        ? {
            ...(sessionKey ? { sessionKey } : {}),
            ...(agentId ? { agentId } : {}),
          }
        : undefined;
    state.deps.enqueueSystemEvent(text, enqueueOpts);
  }

  if (opts.mode === "now") {
    if (state.deps.requestHeartbeat) {
      state.deps.requestHeartbeat({
        source: "manual",
        intent: "immediate",
        reason: "wake",
        ...(sessionKey ? { sessionKey } : {}),
        ...(agentId ? { agentId } : {}),
      });
    }
  } else if (sessionKey) {
    if (state.deps.requestHeartbeat) {
      state.deps.requestHeartbeat({
        source: "manual",
        intent: "immediate",
        reason: "wake",
        sessionKey,
        ...(agentId ? { agentId } : {}),
      });
    }
  }

  return { ok: true };
}

/**
 * 处理错过的任务
 * 在系统休眠恢复后，检查是否有任务在休眠期间到期
 */
export function handleMissedJobs(state: CronServiceState): {
  missedCount: number;
  jobs: Array<{ jobId: string; jobName: string; missedAt: number }>;
} {
  const jobs = state.store?.jobs ?? [];
  const nowMs = state.deps.nowMs();
  const missed: Array<{ jobId: string; jobName: string; missedAt: number }> = [];

  for (const job of jobs) {
    if (!job.enabled && job.state.nextRunAtMs) {
      continue;
    }
    const nextRun = job.state.nextRunAtMs;
    if (typeof nextRun === "number" && nextRun < nowMs) {
      missed.push({
        jobId: job.id,
        jobName: job.name,
        missedAt: nextRun,
      });
    }
  }

  return {
    missedCount: missed.length,
    jobs: missed,
  };
}

/**
 * 重置唤醒检测状态
 */
export function resetWakeDetection(): void {
  wakeState.lastTickAt = null;
  wakeState.expectedDelay = null;
}

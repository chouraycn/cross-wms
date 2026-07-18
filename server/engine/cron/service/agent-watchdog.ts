import type { CronJob } from "../types.js";
import { logger } from "../../../logger.js";

const WATCHDOG_INTERVAL_MS = 30000;
const MAX_STUCK_DURATION_MS = 2 * 60 * 60 * 1000;

interface AgentWatchdogState {
  runningJobs: Map<string, { startedAtMs: number; job: CronJob }>;
  intervalId?: NodeJS.Timeout;
  enabled: boolean;
}

const state: AgentWatchdogState = {
  runningJobs: new Map(),
  enabled: true,
};

export function startAgentWatchdog(): void {
  if (state.intervalId) {
    return;
  }

  state.intervalId = setInterval(() => {
    checkStuckJobs();
  }, WATCHDOG_INTERVAL_MS);
}

export function stopAgentWatchdog(): void {
  if (state.intervalId) {
    clearInterval(state.intervalId);
    state.intervalId = undefined;
  }
}

export function registerRunningJob(job: CronJob): void {
  if (!state.enabled) {
    return;
  }
  state.runningJobs.set(job.id, {
    startedAtMs: job.state.runningAtMs ?? Date.now(),
    job,
  });
}

export function unregisterRunningJob(jobId: string): void {
  state.runningJobs.delete(jobId);
}

function checkStuckJobs(): void {
  const now = Date.now();
  for (const [jobId, { startedAtMs, job }] of state.runningJobs) {
    if (now - startedAtMs > MAX_STUCK_DURATION_MS) {
      logger.warn({ jobId, jobName: job.name, startedAtMs, durationMs: now - startedAtMs }, "[cron-watchdog] detected stuck job");
    }
  }
}

export function getRunningJobCount(): number {
  return state.runningJobs.size;
}

export function enableAgentWatchdog(enabled: boolean): void {
  state.enabled = enabled;
  if (!enabled) {
    state.runningJobs.clear();
  }
}
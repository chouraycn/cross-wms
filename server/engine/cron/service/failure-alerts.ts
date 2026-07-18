import type { CronJob, CronRunStatus } from "../types.js";

export interface FailureAlertConfig {
  after?: number;
  cooldownMs?: number;
  includeSkipped?: boolean;
}

const DEFAULT_COOLDOWN_MS = 300000;

export function shouldSendFailureAlert(job: CronJob): boolean {
  const alert = job.failureAlert;
  if (!alert) {
    return false;
  }

  const lastAlertAt = job.state.lastFailureAlertAtMs;
  const cooldownMs = alert.cooldownMs ?? DEFAULT_COOLDOWN_MS;

  if (typeof lastAlertAt === "number" && Date.now() - lastAlertAt < cooldownMs) {
    return false;
  }

  const lastStatus = job.state.lastRunStatus ?? job.state.lastStatus;
  if (lastStatus !== "error") {
    return false;
  }

  const consecutiveErrors = job.state.consecutiveErrors ?? 0;
  const after = alert.after ?? 1;

  if (consecutiveErrors >= after) {
    return true;
  }

  return false;
}

export function recordFailureAlertSent(job: CronJob): void {
  job.state.lastFailureAlertAtMs = Date.now();
}
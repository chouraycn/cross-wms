import type { CronJob } from "../types.js";

export interface TimeoutPolicy {
  defaultTimeoutSeconds: number;
  maxTimeoutSeconds: number;
  noOutputTimeoutSeconds: number;
}

const DEFAULT_POLICY: TimeoutPolicy = {
  defaultTimeoutSeconds: 300,
  maxTimeoutSeconds: 3600,
  noOutputTimeoutSeconds: 120,
};

export function resolveTimeoutPolicy(job: CronJob): TimeoutPolicy {
  if (job.payload.kind === "agentTurn") {
    return {
      ...DEFAULT_POLICY,
      defaultTimeoutSeconds: job.payload.timeoutSeconds ?? DEFAULT_POLICY.defaultTimeoutSeconds,
    };
  }

  if (job.payload.kind === "command") {
    return {
      ...DEFAULT_POLICY,
      defaultTimeoutSeconds: job.payload.timeoutSeconds ?? DEFAULT_POLICY.defaultTimeoutSeconds,
      noOutputTimeoutSeconds: job.payload.noOutputTimeoutSeconds ?? DEFAULT_POLICY.noOutputTimeoutSeconds,
    };
  }

  return DEFAULT_POLICY;
}

export function enforceTimeoutBounds(timeoutSeconds: number): number {
  return Math.max(1, Math.min(timeoutSeconds, DEFAULT_POLICY.maxTimeoutSeconds));
}
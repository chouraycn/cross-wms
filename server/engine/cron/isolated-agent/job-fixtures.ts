import type { CronJob, CronSchedule, CronPayload, CronDelivery } from "../types.js";

export function createTestCronJob(opts?: Partial<CronJob>): CronJob {
  const now = Date.now();
  const schedule: CronSchedule = {
    kind: "every",
    everyMs: 60000,
    anchorMs: now,
  };

  const payload: CronPayload = {
    kind: "agentTurn",
    message: "test message",
  };

  const delivery: CronDelivery = {
    mode: "none",
  };

  return {
    id: `test-job-${Math.random().toString(36).slice(2, 9)}`,
    name: "Test Job",
    description: "Test cron job for isolated agent",
    enabled: true,
    createdAtMs: now,
    updatedAtMs: now,
    schedule: opts?.schedule ?? schedule,
    sessionTarget: opts?.sessionTarget ?? "isolated",
    wakeMode: opts?.wakeMode ?? "now",
    payload: opts?.payload ?? payload,
    delivery: opts?.delivery ?? delivery,
    state: {
      nextRunAtMs: now + 60000,
    },
    ...opts,
  };
}

export function createAgentTurnPayload(message: string): CronPayload {
  return {
    kind: "agentTurn",
    message,
  };
}

export function createCommandPayload(argv: string[]): CronPayload {
  return {
    kind: "command",
    argv,
  };
}

export function createSystemEventPayload(text: string): CronPayload {
  return {
    kind: "systemEvent",
    text,
  };
}
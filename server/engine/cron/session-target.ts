import type { CronJob, CronSessionTarget } from "./types.js";

export type SessionTargetResolution = {
  target: CronSessionTarget;
  sessionKey?: string;
  isolated?: boolean;
};

export function resolveSessionTarget(job: CronJob): SessionTargetResolution {
  const { sessionTarget, sessionKey } = job;

  if (sessionTarget === "isolated") {
    return {
      target: "isolated",
      isolated: true,
      sessionKey: sessionKey ?? `cron:isolated:${job.id}`,
    };
  }

  if (sessionTarget === "main") {
    return {
      target: "main",
      isolated: false,
    };
  }

  if (sessionTarget === "current") {
    return {
      target: "current",
      isolated: false,
    };
  }

  if (sessionTarget.startsWith("session:")) {
    return {
      target: sessionTarget,
      isolated: false,
      sessionKey: sessionTarget.slice(8),
    };
  }

  return {
    target: sessionTarget,
    isolated: false,
    sessionKey,
  };
}
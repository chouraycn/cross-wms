import type { CronSchedule } from "./types.js";

export function computeScheduleIdentity(schedule: CronSchedule): string {
  if (schedule.kind === "at") {
    return `at:${schedule.at}`;
  }

  if (schedule.kind === "every") {
    return `every:${schedule.everyMs}:${schedule.anchorMs ?? 0}`;
  }

  if (schedule.kind === "cron") {
    return `cron:${schedule.expr}:${schedule.tz ?? ""}`;
  }

  return `unknown:${JSON.stringify(schedule)}`;
}

export function computeJobScheduleIdentity(jobId: string, schedule: CronSchedule): string {
  return `${computeScheduleIdentity(schedule)}:${jobId}`;
}
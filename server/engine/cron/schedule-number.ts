import type { CronSchedule } from "./types.js";

export function computeScheduleNumber(schedule: CronSchedule): number {
  const identity = computeScheduleIdentityString(schedule);
  return hashString(identity);
}

function computeScheduleIdentityString(schedule: CronSchedule): string {
  if (schedule.kind === "at") {
    return `at:${schedule.at}`;
  }

  if (schedule.kind === "every") {
    return `every:${schedule.everyMs}:${schedule.anchorMs ?? 0}`;
  }

  if (schedule.kind === "cron") {
    return `cron:${schedule.expr}:${schedule.tz ?? ""}`;
  }

  return JSON.stringify(schedule);
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}
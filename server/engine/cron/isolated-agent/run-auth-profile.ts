import type { CronJob } from "../types.js";
import type { IsolatedAgentAuthProfile } from "./types.js";

export function resolveIsolatedAgentAuthProfile(job: CronJob): IsolatedAgentAuthProfile {
  return { kind: "none" };
}
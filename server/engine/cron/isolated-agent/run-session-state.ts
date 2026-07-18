import type { CronJob } from "../types.js";
import type { IsolatedAgentSessionState } from "./types.js";

export function resolveIsolatedAgentSessionState(job: CronJob): IsolatedAgentSessionState {
  return {
    sessionKey: job.sessionKey,
  };
}
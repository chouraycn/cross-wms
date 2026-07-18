import type { CronJob } from "../types.js";
import type { IsolatedAgentModelSelection } from "./types.js";

export function resolveIsolatedAgentModelSelection(job: CronJob): IsolatedAgentModelSelection {
  if (job.payload.kind === "agentTurn") {
    return {
      model: job.payload.model,
      fallbacks: job.payload.fallbacks,
    };
  }
  return {};
}
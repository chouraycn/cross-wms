import type { CronJob } from "../types.js";
import type { IsolatedAgentDeliveryOptions } from "./types.js";

export function resolveIsolatedAgentDeliveryOptions(job: CronJob): IsolatedAgentDeliveryOptions {
  if (!job.delivery) {
    return {};
  }

  return {
    mode: job.delivery.mode,
    channel: job.delivery.channel,
    to: job.delivery.to,
    accountId: job.delivery.accountId,
    threadId: job.delivery.threadId,
    bestEffort: job.delivery.bestEffort,
  };
}
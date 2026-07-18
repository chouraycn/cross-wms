import type { CronJob, CronDelivery } from "../types.js";

export interface InitialDeliveryConfig {
  mode?: "none" | "announce" | "webhook";
  channel?: string;
  to?: string;
}

export function resolveInitialDelivery(job: CronJob): InitialDeliveryConfig {
  if (!job.delivery || job.delivery.mode === "none") {
    return { mode: "none" };
  }

  return {
    mode: job.delivery.mode,
    channel: job.delivery.channel,
    to: job.delivery.to,
  };
}
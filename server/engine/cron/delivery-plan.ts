import type { CronDelivery, CronDeliveryStatus } from "./types.js";

export interface DeliveryPlan {
  mode: "none" | "announce" | "webhook";
  channel?: string;
  to?: string;
  accountId?: string;
  threadId?: string | number;
  bestEffort?: boolean;
  status: CronDeliveryStatus;
}

export function createDeliveryPlan(delivery: CronDelivery | undefined): DeliveryPlan {
  if (!delivery || delivery.mode === "none") {
    return {
      mode: "none",
      status: "not-requested",
    };
  }

  return {
    mode: delivery.mode,
    channel: delivery.channel,
    to: delivery.to,
    accountId: delivery.accountId,
    threadId: delivery.threadId,
    bestEffort: delivery.bestEffort,
    status: "unknown",
  };
}
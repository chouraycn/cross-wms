import type { CronDelivery, CronDeliveryTrace, CronDeliveryTraceTarget, CronDeliveryTraceMessageTarget } from "./types.js";

export interface DeliveryContext {
  mode: "none" | "announce" | "webhook";
  channel?: string;
  to?: string;
  accountId?: string;
  threadId?: string | number;
  sessionKey?: string;
  source?: "explicit" | "last" | "fallback";
}

export interface DeliveryResolution {
  resolved?: CronDeliveryTraceTarget;
  intended?: CronDeliveryTraceTarget;
  messageToolSentTo?: CronDeliveryTraceMessageTarget[];
  fallbackUsed?: boolean;
  delivered?: boolean;
}

export function createDeliveryContextFromJob(delivery: CronDelivery | undefined): DeliveryContext {
  if (!delivery) {
    return { mode: "none" };
  }

  return {
    mode: delivery.mode,
    channel: delivery.channel,
    to: delivery.to,
    accountId: delivery.accountId,
    threadId: delivery.threadId,
    source: "explicit",
  };
}

export function createDeliveryTrace(context: DeliveryContext, resolution: DeliveryResolution): CronDeliveryTrace {
  return {
    intended: resolution.intended,
    resolved: resolution.resolved ? { ...resolution.resolved, ok: true } : undefined,
    messageToolSentTo: resolution.messageToolSentTo,
    fallbackUsed: resolution.fallbackUsed,
    delivered: resolution.delivered,
  };
}
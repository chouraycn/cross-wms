// 移植自 openclaw/src/infra/deliver.ts
// 降级：outbound delivery 依赖简化

export type OutboundDeliveryQueuePolicy = "immediate" | "queued" | "durable";

export type OutboundDeliveryIntent = {
  channel: string;
  to: string;
  accountId?: string;
  threadId?: string;
  payloads: unknown[];
  queuePolicy?: OutboundDeliveryQueuePolicy;
};

export type DurableFinalDeliveryRequirement = "required" | "best-effort" | "none";

export type DurableFinalDeliveryRequirements = {
  requirement: DurableFinalDeliveryRequirement;
};

export type OutboundDurableDeliverySupport = {
  supported: boolean;
  requirements?: DurableFinalDeliveryRequirements;
};

export type NormalizedOutboundPayload = {
  text?: string;
  mediaUrl?: string;
  [key: string]: unknown;
};

export type OutboundSendDeps = {
  send?: (params: unknown) => Promise<unknown>;
};

export type DeliverOutboundPayloadsParams = {
  channel: string;
  to: string;
  accountId?: string;
  threadId?: string;
  payloads: readonly NormalizedOutboundPayload[];
  cfg?: unknown;
  sessionContext?: unknown;
  sendDeps?: OutboundSendDeps;
};

export type OutboundDeliveryResult = {
  status: "ok" | "failed" | "partial_failed";
  results?: unknown[];
  error?: Error;
};

/** Resolves durable delivery support for a channel. */
export function resolveOutboundDurableFinalDeliverySupport(_params: {
  channel: string;
  cfg?: unknown;
}): OutboundDurableDeliverySupport {
  return { supported: false };
}

/** Delivers outbound payloads. Simplified without real delivery. */
export async function deliverOutboundPayloads(params: DeliverOutboundPayloadsParams): Promise<OutboundDeliveryResult> {
  return { status: "ok" };
}

/** Internal delivery implementation. Simplified without real delivery. */
export async function deliverOutboundPayloadsInternal(params: DeliverOutboundPayloadsParams): Promise<OutboundDeliveryResult> {
  return { status: "ok" };
}

/** Normalizes outbound payloads for delivery. */
export function normalizeOutboundPayloads(payloads: readonly unknown[]): NormalizedOutboundPayload[] {
  return payloads.map((p) => {
    if (p && typeof p === "object" && !Array.isArray(p)) {
      return p as NormalizedOutboundPayload;
    }
    return { text: String(p) };
  });
}

/** Resolves outbound send dependencies. */
export function resolveOutboundSendDep(params: { channel: string; cfg?: unknown }): OutboundSendDeps {
  return {};
}

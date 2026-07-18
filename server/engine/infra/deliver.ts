// 移植自 openclaw/src/infra/deliver.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type OutboundDeliveryQueuePolicy = unknown;
export type OutboundDeliveryIntent = unknown;
export type DurableFinalDeliveryRequirement = unknown;
export type DurableFinalDeliveryRequirements = unknown;
export type OutboundDurableDeliverySupport = unknown;
export type DeliverOutboundPayloadsParams = unknown;
export type OutboundDeliveryResult = unknown;
export type NormalizedOutboundPayload = unknown;
export function resolveOutboundDurableFinalDeliverySupport(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveOutboundDurableFinalDeliverySupport");
}
export function deliverOutboundPayloads(...args: unknown[]): unknown {
  throw new Error("not implemented: deliverOutboundPayloads");
}
export function deliverOutboundPayloadsInternal(...args: unknown[]): unknown {
  throw new Error("not implemented: deliverOutboundPayloadsInternal");
}
export type normalizeOutboundPayloads = unknown;
export const normalizeOutboundPayloads: unknown = undefined;
export type resolveOutboundSendDep = unknown;
export const resolveOutboundSendDep: unknown = undefined;
export type OutboundSendDeps = unknown;
export const OutboundSendDeps: unknown = undefined;

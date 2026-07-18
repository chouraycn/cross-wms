// 移植自 openclaw/src/infra/payloads.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type NormalizedOutboundPayload = unknown;
export type OutboundPayloadJson = unknown;
export type OutboundPayloadPlan = unknown;
export type OutboundPayloadMirror = unknown;
export function createOutboundPayloadPlan(...args: unknown[]): unknown {
  throw new Error("not implemented: createOutboundPayloadPlan");
}
export function projectOutboundPayloadPlanForDelivery(...args: unknown[]): unknown {
  throw new Error("not implemented: projectOutboundPayloadPlanForDelivery");
}
export function projectOutboundPayloadPlanForOutbound(...args: unknown[]): unknown {
  throw new Error("not implemented: projectOutboundPayloadPlanForOutbound");
}
export function projectOutboundPayloadPlanForJson(...args: unknown[]): unknown {
  throw new Error("not implemented: projectOutboundPayloadPlanForJson");
}
export function projectOutboundPayloadPlanForMirror(...args: unknown[]): unknown {
  throw new Error("not implemented: projectOutboundPayloadPlanForMirror");
}
export function summarizeOutboundPayloadForTransport(...args: unknown[]): unknown {
  throw new Error("not implemented: summarizeOutboundPayloadForTransport");
}
export function normalizeReplyPayloadsForDelivery(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeReplyPayloadsForDelivery");
}
export function normalizeOutboundPayloads(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeOutboundPayloads");
}
export function normalizeOutboundPayloadsForJson(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeOutboundPayloadsForJson");
}
export function formatOutboundPayloadLog(...args: unknown[]): unknown {
  throw new Error("not implemented: formatOutboundPayloadLog");
}

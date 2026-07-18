// 移植自 openclaw/src/infra/deliver-types.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type OutboundDeliveryResult = unknown;
export type OutboundPayloadDeliverySuppressionReason = unknown;
export type OutboundDeliveryFailureStage = unknown;
export type OutboundPayloadDeliveryOutcome = unknown;
export function isOutboundDeliveryError(...args: unknown[]): unknown {
  throw new Error("not implemented: isOutboundDeliveryError");
}
export class OutboundDeliveryError {
  constructor(...args: unknown[]) { throw new Error("not implemented: OutboundDeliveryError"); }
}

// 移植自 openclaw/src/infra/format.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type OutboundDeliveryJson = unknown;
export function formatCommandSpans(...args: unknown[]): unknown {
  throw new Error("not implemented: formatCommandSpans");
}
export function formatOutboundDeliverySummary(...args: unknown[]): unknown {
  throw new Error("not implemented: formatOutboundDeliverySummary");
}
export function formatGatewaySummary(...args: unknown[]): unknown {
  throw new Error("not implemented: formatGatewaySummary");
}

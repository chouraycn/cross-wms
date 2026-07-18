// 移植自 openclaw/src/infra/source-delivery-plan.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type SourceVisibleDeliveryOwner = unknown;
export type SourceDeliveryPlanReason = unknown;
export type SourceDeliveryTarget = unknown;
export type SourceDeliveryMessageToolTarget = unknown;
export type SourceDeliveryVisibleDelivery = unknown;
export type SourceDeliveryOutcome = unknown;
export type SourceDeliveryPlan = unknown;
export function sourceDeliveryTargetsMatch(...args: unknown[]): unknown {
  throw new Error("not implemented: sourceDeliveryTargetsMatch");
}
export function createSourceDeliveryPlan(...args: unknown[]): unknown {
  throw new Error("not implemented: createSourceDeliveryPlan");
}
export function resolveSourceDeliveryOutcome(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveSourceDeliveryOutcome");
}

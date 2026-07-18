// 移植自 openclaw/src/infra/bound-delivery-router.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type BoundDeliveryRouterInput = unknown;
export type BoundDeliveryRouterResult = unknown;
export type BoundDeliveryRouter = unknown;
export function createBoundDeliveryRouter(...args: unknown[]): unknown {
  throw new Error("not implemented: createBoundDeliveryRouter");
}

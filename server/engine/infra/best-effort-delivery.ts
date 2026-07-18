// 移植自 openclaw/src/infra/best-effort-delivery.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ExternalBestEffortDeliveryTarget = unknown;
export function resolveExternalBestEffortDeliveryTarget(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveExternalBestEffortDeliveryTarget");
}
export function shouldDowngradeDeliveryToSessionOnly(...args: unknown[]): unknown {
  throw new Error("not implemented: shouldDowngradeDeliveryToSessionOnly");
}

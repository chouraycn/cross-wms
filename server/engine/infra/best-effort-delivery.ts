// 移植自 openclaw/src/infra/best-effort-delivery.ts

export type ExternalBestEffortDeliveryTarget = unknown;
export function resolveExternalBestEffortDeliveryTarget(...args: unknown[]): unknown {
  return undefined;
}
export function shouldDowngradeDeliveryToSessionOnly(...args: unknown[]): unknown {
  return false;
}

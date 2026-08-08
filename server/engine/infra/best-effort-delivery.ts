// 移植自 openclaw/src/infra/best-effort-delivery.ts

export type ExternalBestEffortDeliveryTarget = unknown;
export function resolveExternalBestEffortDeliveryTarget(...args: any[]): any {
  return undefined;
}
export function shouldDowngradeDeliveryToSessionOnly(...args: any[]): any {
  return false;
}

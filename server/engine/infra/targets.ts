// 移植自 openclaw/src/infra/targets.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type OutboundChannel = unknown;
export type HeartbeatTarget = unknown;
export type OutboundTarget = unknown;
export type HeartbeatSenderContext = unknown;
export type OutboundTargetResolution = unknown;
export function resolveOutboundTarget(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveOutboundTarget");
}
export function resolveHeartbeatDeliveryTarget(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveHeartbeatDeliveryTarget");
}
export function resolveHeartbeatDeliveryTargetWithSessionRoute(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveHeartbeatDeliveryTargetWithSessionRoute");
}
export function resolveHeartbeatSenderContext(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveHeartbeatSenderContext");
}
export type resolveSessionDeliveryTarget = unknown;
export const resolveSessionDeliveryTarget: unknown = undefined;
export type SessionDeliveryTarget = unknown;
export const SessionDeliveryTarget: unknown = undefined;

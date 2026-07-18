// 移植自 openclaw/src/infra/push-apns.relay.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ApnsRelayConfig = unknown;
export type ApnsRelayPushResponse = unknown;
export type ApnsRelayRequestSender = unknown;
export function normalizeApnsRelayBaseUrl(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeApnsRelayBaseUrl");
}
export function resolveApnsRelayConfigFromEnv(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveApnsRelayConfigFromEnv");
}
export function sendApnsRelayPush(...args: unknown[]): unknown {
  throw new Error("not implemented: sendApnsRelayPush");
}
export const DEFAULT_APNS_RELAY_BASE_URL: unknown = undefined;
export const DEFAULT_APNS_SANDBOX_RELAY_BASE_URL: unknown = undefined;

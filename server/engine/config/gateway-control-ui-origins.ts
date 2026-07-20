// 移植自 openclaw/src/config/gateway-control-ui-origins.ts

export type GatewayNonLoopbackBindMode = unknown;
export function isGatewayNonLoopbackBindMode(...args: unknown[]): unknown {
  return false;
}
export function hasConfiguredControlUiAllowedOrigins(...args: unknown[]): unknown {
  return false;
}
export function resolveGatewayPortWithDefault(...args: unknown[]): unknown {
  return undefined;
}
export function buildDefaultControlUiAllowedOrigins(...args: unknown[]): unknown {
  return undefined;
}
export function ensureControlUiAllowedOriginsForNonLoopbackBind(...args: unknown[]): unknown {
  return undefined;
}

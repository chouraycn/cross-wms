// 移植自 openclaw/src/config/gateway-control-ui-origins.ts

export type GatewayNonLoopbackBindMode = unknown;
export function isGatewayNonLoopbackBindMode(...args: any[]): any {
  return false;
}
export function hasConfiguredControlUiAllowedOrigins(...args: any[]): any {
  return false;
}
export function resolveGatewayPortWithDefault(...args: any[]): any {
  return undefined;
}
export function buildDefaultControlUiAllowedOrigins(...args: any[]): any {
  return undefined;
}
export function ensureControlUiAllowedOriginsForNonLoopbackBind(...args: any[]): any {
  return undefined;
}

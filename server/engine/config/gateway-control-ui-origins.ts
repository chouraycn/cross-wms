// 移植自 openclaw/src/config/gateway-control-ui-origins.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type GatewayNonLoopbackBindMode = unknown;
export function isGatewayNonLoopbackBindMode(...args: unknown[]): unknown {
  throw new Error("not implemented: isGatewayNonLoopbackBindMode");
}
export function hasConfiguredControlUiAllowedOrigins(...args: unknown[]): unknown {
  throw new Error("not implemented: hasConfiguredControlUiAllowedOrigins");
}
export function resolveGatewayPortWithDefault(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveGatewayPortWithDefault");
}
export function buildDefaultControlUiAllowedOrigins(...args: unknown[]): unknown {
  throw new Error("not implemented: buildDefaultControlUiAllowedOrigins");
}
export function ensureControlUiAllowedOriginsForNonLoopbackBind(...args: unknown[]): unknown {
  throw new Error("not implemented: ensureControlUiAllowedOriginsForNonLoopbackBind");
}

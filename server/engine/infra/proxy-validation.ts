// 移植自 openclaw/src/infra/proxy-validation.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ProxyValidationConfigSource = unknown;
export type ProxyValidationResolvedConfig = unknown;
export type ProxyValidationCheckKind = unknown;
export type ProxyValidationCheck = unknown;
export type ProxyValidationResult = unknown;
export type ProxyValidationFetchCheckParams = unknown;
export type ProxyValidationFetchCheckResult = unknown;
export type ProxyValidationFetchCheck = unknown;
export type ProxyValidationApnsCheckParams = unknown;
export type ProxyValidationApnsCheckResult = unknown;
export type ProxyValidationApnsCheck = unknown;
export type ResolveProxyValidationConfigOptions = unknown;
export type RunProxyValidationOptions = unknown;
export function resolveProxyValidationConfig(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveProxyValidationConfig");
}
export function runProxyValidation(...args: unknown[]): unknown {
  throw new Error("not implemented: runProxyValidation");
}
export const DEFAULT_PROXY_VALIDATION_ALLOWED_URLS: unknown = undefined;
export const DEFAULT_PROXY_VALIDATION_APNS_AUTHORITY: unknown = undefined;

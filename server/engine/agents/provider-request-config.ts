/**
 * 移植自 openclaw/src/agents/provider-request-config.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type ProviderRequestAuthOverride = unknown;
export type ProviderRequestTlsOverride = unknown;
export type ProviderRequestProxyOverride = unknown;
export type ProviderRequestTransportOverrides = unknown;
export type ModelProviderRequestTransportOverrides = unknown;
export type ResolvedProviderRequestConfig = unknown;
export function sanitizeConfiguredProviderRequest(..._args: unknown[]): unknown {
  return undefined;
}
export function sanitizeConfiguredModelProviderRequest(..._args: unknown[]): unknown {
  return undefined;
}
export function mergeProviderRequestOverrides(..._args: unknown[]): unknown {
  return undefined;
}
export function mergeModelProviderRequestOverrides(..._args: unknown[]): unknown {
  return undefined;
}
export function normalizeBaseUrl(..._args: unknown[]): unknown {
  return undefined;
}
export function sanitizeRuntimeProviderRequestOverrides(..._args: unknown[]): unknown {
  return undefined;
}
export function applyPreparedRuntimeAuthToModel(..._args: unknown[]): unknown {
  return undefined;
}
export function buildProviderRequestDispatcherPolicy(..._args: unknown[]): unknown {
  return undefined;
}
export function resolveProviderRequestPolicyConfig(..._args: unknown[]): unknown {
  return undefined;
}
export function resolveProviderRequestConfig(..._args: unknown[]): unknown {
  return undefined;
}
export function resolveProviderRequestHeaders(..._args: unknown[]): unknown {
  return undefined;
}
export function attachModelProviderRequestTransport(..._args: unknown[]): unknown {
  return undefined;
}
export function getModelProviderRequestTransport(..._args: unknown[]): unknown {
  return undefined;
}

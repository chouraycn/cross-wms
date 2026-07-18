/**
 * 移植自 openclaw/src/agents/provider-attribution.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type ProviderAttributionPolicy = unknown;
export type ProviderRequestTransport = unknown;
export type ProviderRequestCapability = unknown;
export type ProviderEndpointClass = unknown;
export type ProviderEndpointResolution = unknown;
export type ProviderRequestPolicyInput = unknown;
export type ProviderRequestPolicyResolution = unknown;
export type ProviderRequestCapabilitiesInput = unknown;
export type ProviderRequestCompatibilityFamily = unknown;
export type ProviderRequestCapabilities = unknown;
export function resolveProviderEndpoint(..._args: unknown[]): unknown {
  throw new Error("resolveProviderEndpoint not implemented (openclaw stub)");
}
export function resolveProviderAttributionIdentity(..._args: unknown[]): unknown {
  throw new Error("resolveProviderAttributionIdentity not implemented (openclaw stub)");
}
export function listProviderAttributionPolicies(..._args: unknown[]): unknown {
  throw new Error("listProviderAttributionPolicies not implemented (openclaw stub)");
}
export function resolveProviderAttributionPolicy(..._args: unknown[]): unknown {
  throw new Error("resolveProviderAttributionPolicy not implemented (openclaw stub)");
}
export function resolveProviderRequestPolicy(..._args: unknown[]): unknown {
  throw new Error("resolveProviderRequestPolicy not implemented (openclaw stub)");
}
export function resolveProviderRequestCapabilities(..._args: unknown[]): unknown {
  throw new Error("resolveProviderRequestCapabilities not implemented (openclaw stub)");
}
export function describeProviderRequestRoutingSummary(..._args: unknown[]): unknown {
  throw new Error("describeProviderRequestRoutingSummary not implemented (openclaw stub)");
}

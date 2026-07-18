/**
 * 移植自 openclaw/src/agents/models-config.providers.secret-helpers.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type ProviderConfig = unknown;
export type SecretDefaults = unknown;
export type ProviderApiKeyResolver = unknown;
export type ProviderAuthResolver = unknown;
export function normalizeApiKeyConfig(..._args: unknown[]): unknown {
  throw new Error("normalizeApiKeyConfig not implemented (openclaw stub)");
}
export function toDiscoveryApiKey(..._args: unknown[]): unknown {
  throw new Error("toDiscoveryApiKey not implemented (openclaw stub)");
}
export function resolveEnvApiKeyVarName(..._args: unknown[]): unknown {
  throw new Error("resolveEnvApiKeyVarName not implemented (openclaw stub)");
}
export function resolveAwsSdkApiKeyVarName(..._args: unknown[]): unknown {
  throw new Error("resolveAwsSdkApiKeyVarName not implemented (openclaw stub)");
}
export function normalizeHeaderValues(..._args: unknown[]): unknown {
  throw new Error("normalizeHeaderValues not implemented (openclaw stub)");
}
export function resolveApiKeyFromCredential(..._args: unknown[]): unknown {
  throw new Error("resolveApiKeyFromCredential not implemented (openclaw stub)");
}
export function listAuthProfilesForProvider(..._args: unknown[]): unknown {
  throw new Error("listAuthProfilesForProvider not implemented (openclaw stub)");
}
export function resolveApiKeyFromProfiles(..._args: unknown[]): unknown {
  throw new Error("resolveApiKeyFromProfiles not implemented (openclaw stub)");
}
export function normalizeConfiguredProviderApiKey(..._args: unknown[]): unknown {
  throw new Error("normalizeConfiguredProviderApiKey not implemented (openclaw stub)");
}
export function normalizeResolvedEnvApiKey(..._args: unknown[]): unknown {
  throw new Error("normalizeResolvedEnvApiKey not implemented (openclaw stub)");
}
export function resolveMissingProviderApiKey(..._args: unknown[]): unknown {
  throw new Error("resolveMissingProviderApiKey not implemented (openclaw stub)");
}

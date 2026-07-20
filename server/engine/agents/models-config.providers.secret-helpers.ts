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
  return undefined;
}
export function toDiscoveryApiKey(..._args: unknown[]): unknown {
  return undefined;
}
export function resolveEnvApiKeyVarName(..._args: unknown[]): unknown {
  return undefined;
}
export function resolveAwsSdkApiKeyVarName(..._args: unknown[]): unknown {
  return undefined;
}
export function normalizeHeaderValues(..._args: unknown[]): unknown {
  return undefined;
}
export function resolveApiKeyFromCredential(..._args: unknown[]): unknown {
  return undefined;
}
export function listAuthProfilesForProvider(..._args: unknown[]): unknown {
  return [];
}
export function resolveApiKeyFromProfiles(..._args: unknown[]): unknown {
  return undefined;
}
export function normalizeConfiguredProviderApiKey(..._args: unknown[]): unknown {
  return undefined;
}
export function normalizeResolvedEnvApiKey(..._args: unknown[]): unknown {
  return undefined;
}
export function resolveMissingProviderApiKey(..._args: unknown[]): unknown {
  return undefined;
}

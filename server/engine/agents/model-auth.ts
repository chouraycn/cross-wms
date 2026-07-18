/**
 * 移植自 openclaw/src/agents/model-auth.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export { formatMissingAuthError, isMissingProviderAuthError, isProviderAuthError, MissingProviderAuthError, ProviderAuthError, requireApiKey, resolveAwsSdkEnvVarName } from "./model-auth-runtime-shared.js";
export { resolveEnvApiKey } from "./model-auth-env.js";
export type { ResolvedProviderAuth } from "./model-auth-runtime-shared.js";
export type { EnvApiKeyResult } from "./model-auth-env.js";
export type ProviderCredentialPrecedence = unknown;
export type RuntimeProviderAuthLookup = unknown;
export type ProviderEntryApiKeyBindingResolution = unknown;
export type ModelAuthMode = unknown;
export function createRuntimeProviderAuthLookup(..._args: unknown[]): unknown {
  throw new Error("createRuntimeProviderAuthLookup not implemented (openclaw stub)");
}
export function getCustomProviderApiKey(..._args: unknown[]): unknown {
  throw new Error("getCustomProviderApiKey not implemented (openclaw stub)");
}
export function resolveUsableCustomProviderApiKey(..._args: unknown[]): unknown {
  throw new Error("resolveUsableCustomProviderApiKey not implemented (openclaw stub)");
}
export function hasUsableCustomProviderApiKey(..._args: unknown[]): unknown {
  throw new Error("hasUsableCustomProviderApiKey not implemented (openclaw stub)");
}
export function shouldPreferExplicitConfigApiKeyAuth(..._args: unknown[]): unknown {
  throw new Error("shouldPreferExplicitConfigApiKeyAuth not implemented (openclaw stub)");
}
export function canUseProfileAsProviderEntryApiKey(..._args: unknown[]): unknown {
  throw new Error("canUseProfileAsProviderEntryApiKey not implemented (openclaw stub)");
}
export function resolveProviderEntryApiKeyProfileReference(..._args: unknown[]): unknown {
  throw new Error("resolveProviderEntryApiKeyProfileReference not implemented (openclaw stub)");
}
export async function resolveProviderEntryApiKeyBinding(..._args: unknown[]): Promise<unknown> {
  throw new Error("resolveProviderEntryApiKeyBinding not implemented (openclaw stub)");
}
export function hasSyntheticLocalProviderAuthConfig(..._args: unknown[]): unknown {
  throw new Error("hasSyntheticLocalProviderAuthConfig not implemented (openclaw stub)");
}
export function hasRuntimeAvailableProviderAuth(..._args: unknown[]): unknown {
  throw new Error("hasRuntimeAvailableProviderAuth not implemented (openclaw stub)");
}
export async function resolveApiKeyForProvider(..._args: unknown[]): Promise<unknown> {
  throw new Error("resolveApiKeyForProvider not implemented (openclaw stub)");
}
export function resolveModelAuthMode(..._args: unknown[]): unknown {
  throw new Error("resolveModelAuthMode not implemented (openclaw stub)");
}
export async function hasAvailableAuthForProvider(..._args: unknown[]): Promise<unknown> {
  throw new Error("hasAvailableAuthForProvider not implemented (openclaw stub)");
}
export async function getApiKeyForModel(..._args: unknown[]): Promise<unknown> {
  throw new Error("getApiKeyForModel not implemented (openclaw stub)");
}
export function applyLocalNoAuthHeaderOverride(..._args: unknown[]): unknown {
  throw new Error("applyLocalNoAuthHeaderOverride not implemented (openclaw stub)");
}
export function applyAuthHeaderOverride(..._args: unknown[]): unknown {
  throw new Error("applyAuthHeaderOverride not implemented (openclaw stub)");
}

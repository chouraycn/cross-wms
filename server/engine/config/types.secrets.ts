// 移植自 openclaw/src/config/types.secrets.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type SecretRefSource = unknown;
export type SecretRef = unknown;
export type SecretInput = unknown;
export type SecretInputStringResolutionMode = unknown;
export type SecretInputStringResolution = unknown;
export type EnvSecretProviderConfig = unknown;
export type FileSecretProviderMode = unknown;
export type FileSecretProviderConfig = unknown;
export type ManualExecSecretProviderConfig = unknown;
export type PluginIntegrationSecretProviderConfig = unknown;
export type ExecSecretProviderConfig = unknown;
export type SecretProviderConfig = unknown;
export type SecretsConfig = unknown;
export function isValidEnvSecretRefId(...args: unknown[]): unknown {
  throw new Error("not implemented: isValidEnvSecretRefId");
}
export function isSecretRef(...args: unknown[]): unknown {
  throw new Error("not implemented: isSecretRef");
}
export function parseEnvTemplateSecretRef(...args: unknown[]): unknown {
  throw new Error("not implemented: parseEnvTemplateSecretRef");
}
export function parseLegacySecretRefEnvMarker(...args: unknown[]): unknown {
  throw new Error("not implemented: parseLegacySecretRefEnvMarker");
}
export function coerceSecretRef(...args: unknown[]): unknown {
  throw new Error("not implemented: coerceSecretRef");
}
export function hasConfiguredSecretInput(...args: unknown[]): unknown {
  throw new Error("not implemented: hasConfiguredSecretInput");
}
export function normalizeSecretInputString(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeSecretInputString");
}
export function isUnresolvedSecretInputError(...args: unknown[]): unknown {
  throw new Error("not implemented: isUnresolvedSecretInputError");
}
export function assertSecretInputResolved(...args: unknown[]): unknown {
  throw new Error("not implemented: assertSecretInputResolved");
}
export function resolveSecretInputString(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveSecretInputString");
}
export function normalizeResolvedSecretInputString(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeResolvedSecretInputString");
}
export function resolveSecretInputRef(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveSecretInputRef");
}
export const DEFAULT_SECRET_PROVIDER_ALIAS: unknown = undefined;
export const ENV_SECRET_REF_ID_RE: unknown = undefined;
export const LEGACY_SECRETREF_ENV_MARKER_PREFIX: unknown = undefined;
export const LEGACY_DOUBLE_UNDERSCORE_ENV_MARKER_PREFIX: unknown = undefined;
export class UnresolvedSecretInputError {
  constructor(...args: unknown[]) { throw new Error("not implemented: UnresolvedSecretInputError"); }
}

// 移植自 openclaw/src/config/types.secrets.ts

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
  return false;
}
export function isSecretRef(...args: unknown[]): unknown {
  return false;
}
export function parseEnvTemplateSecretRef(...args: unknown[]): unknown {
  return undefined;
}
export function parseLegacySecretRefEnvMarker(...args: unknown[]): unknown {
  return undefined;
}
export function coerceSecretRef(...args: unknown[]): unknown {
  return undefined;
}
export function hasConfiguredSecretInput(...args: unknown[]): unknown {
  return false;
}
export function normalizeSecretInputString(...args: unknown[]): unknown {
  return undefined;
}
export function isUnresolvedSecretInputError(...args: unknown[]): unknown {
  return false;
}
export function assertSecretInputResolved(...args: unknown[]): unknown {
  return undefined;
}
export function resolveSecretInputString(...args: unknown[]): unknown {
  return undefined;
}
export function normalizeResolvedSecretInputString(...args: unknown[]): unknown {
  return undefined;
}
export function resolveSecretInputRef(...args: unknown[]): unknown {
  return undefined;
}
export const DEFAULT_SECRET_PROVIDER_ALIAS: unknown = undefined;
export const ENV_SECRET_REF_ID_RE: unknown = undefined;
export const LEGACY_SECRETREF_ENV_MARKER_PREFIX: unknown = undefined;
export const LEGACY_DOUBLE_UNDERSCORE_ENV_MARKER_PREFIX: unknown = undefined;
export class UnresolvedSecretInputError {
  // Stub: not fully ported
}

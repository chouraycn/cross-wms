/**
 * 移植自 openclaw/src/agents/model-auth-markers.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export const MINIMAX_OAUTH_MARKER: unknown = undefined;
export const OAUTH_API_KEY_MARKER_PREFIX: unknown = undefined;
export const OLLAMA_LOCAL_AUTH_MARKER: unknown = undefined;
export const CUSTOM_LOCAL_AUTH_MARKER: unknown = undefined;
export const CODEX_APP_SERVER_AUTH_MARKER: unknown = undefined;
export const GCP_VERTEX_CREDENTIALS_MARKER: unknown = undefined;
export const NON_ENV_SECRETREF_MARKER: unknown = undefined;
export const SECRETREF_ENV_HEADER_MARKER_PREFIX: unknown = undefined;
export function listKnownNonSecretApiKeyMarkers(..._args: unknown[]): unknown {
  throw new Error("listKnownNonSecretApiKeyMarkers not implemented (openclaw stub)");
}
export function isAwsSdkAuthMarker(..._args: unknown[]): unknown {
  throw new Error("isAwsSdkAuthMarker not implemented (openclaw stub)");
}
export function isKnownEnvApiKeyMarker(..._args: unknown[]): unknown {
  throw new Error("isKnownEnvApiKeyMarker not implemented (openclaw stub)");
}
export function resolveOAuthApiKeyMarker(..._args: unknown[]): unknown {
  throw new Error("resolveOAuthApiKeyMarker not implemented (openclaw stub)");
}
export function isOAuthApiKeyMarker(..._args: unknown[]): unknown {
  throw new Error("isOAuthApiKeyMarker not implemented (openclaw stub)");
}
export function resolveNonEnvSecretRefApiKeyMarker(..._args: unknown[]): unknown {
  throw new Error("resolveNonEnvSecretRefApiKeyMarker not implemented (openclaw stub)");
}
export function resolveNonEnvSecretRefHeaderValueMarker(..._args: unknown[]): unknown {
  throw new Error("resolveNonEnvSecretRefHeaderValueMarker not implemented (openclaw stub)");
}
export function resolveEnvSecretRefHeaderValueMarker(..._args: unknown[]): unknown {
  throw new Error("resolveEnvSecretRefHeaderValueMarker not implemented (openclaw stub)");
}
export function isSecretRefHeaderValueMarker(..._args: unknown[]): unknown {
  throw new Error("isSecretRefHeaderValueMarker not implemented (openclaw stub)");
}
export function isNonSecretApiKeyMarker(..._args: unknown[]): unknown {
  throw new Error("isNonSecretApiKeyMarker not implemented (openclaw stub)");
}

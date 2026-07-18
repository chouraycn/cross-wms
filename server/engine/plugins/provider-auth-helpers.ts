/**
 * Builds provider auth credentials from config and plugin metadata.
 * 移植自 openclaw/src/plugins/provider-auth-helpers.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type ApiKeyStorageOptions = unknown;

export type WriteOAuthCredentialsOptions = unknown;

export function buildApiKeyCredential(...args: unknown[]): unknown {
  throw new Error("not implemented: buildApiKeyCredential");
}

export function upsertApiKeyProfile(...args: unknown[]): unknown {
  throw new Error("not implemented: upsertApiKeyProfile");
}

export function applyAuthProfileConfig(...args: unknown[]): unknown {
  throw new Error("not implemented: applyAuthProfileConfig");
}



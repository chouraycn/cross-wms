/**
 * * Shared runtime helpers for embedding provider lookup across core and plugin capabilities.
 * 移植自 openclaw/src/plugins/embedding-provider-runtime-shared.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export function resolveRuntimeEmbeddingProviderLookupIds(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveRuntimeEmbeddingProviderLookupIds");
}

export function listRuntimeEmbeddingProviderAdapters(...args: unknown[]): unknown {
  throw new Error("not implemented: listRuntimeEmbeddingProviderAdapters");
}

export function getRuntimeEmbeddingProviderAdapter(...args: unknown[]): unknown {
  throw new Error("not implemented: getRuntimeEmbeddingProviderAdapter");
}


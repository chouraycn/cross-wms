/**
 * Plugin module: embedding-provider-config.ts
 * 移植自 openclaw/src/plugins/embedding-provider-config.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export function readConfiguredProviderApiId(...args: unknown[]): unknown {
  throw new Error("not implemented: readConfiguredProviderApiId");
}

export function resolveConfiguredGenericEmbeddingProviderId(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveConfiguredGenericEmbeddingProviderId");
}


/**
 * Extracts explicit public artifacts from web provider plugin manifests.
 * 移植自 openclaw/src/plugins/web-provider-public-artifacts.explicit.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export function loadBundledWebSearchProviderEntriesFromDir(...args: unknown[]): unknown {
  throw new Error("not implemented: loadBundledWebSearchProviderEntriesFromDir");
}

export function loadBundledWebFetchProviderEntriesFromDir(...args: unknown[]): unknown {
  throw new Error("not implemented: loadBundledWebFetchProviderEntriesFromDir");
}

export function resolveBundledExplicitWebSearchProvidersFromPublicArtifacts(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveBundledExplicitWebSearchProvidersFromPublicArtifacts");
}

export function resolveBundledExplicitWebFetchProvidersFromPublicArtifacts(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveBundledExplicitWebFetchProvidersFromPublicArtifacts");
}


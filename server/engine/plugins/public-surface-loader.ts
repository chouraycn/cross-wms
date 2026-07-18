/**
 * Loads documented plugin public surfaces while preserving lazy boundaries.
 * 移植自 openclaw/src/plugins/public-surface-loader.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export function loadBundledPluginPublicArtifactModuleSync(...args: unknown[]): unknown {
  throw new Error("not implemented: loadBundledPluginPublicArtifactModuleSync");
}

export function loadBundledPluginPublicArtifactModuleFromCandidatesSync(...args: unknown[]): unknown {
  throw new Error("not implemented: loadBundledPluginPublicArtifactModuleFromCandidatesSync");
}

export function resolveBundledPluginPublicArtifactPath(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveBundledPluginPublicArtifactPath");
}

export function resetBundledPluginPublicArtifactLoaderForTest(...args: unknown[]): unknown {
  throw new Error("not implemented: resetBundledPluginPublicArtifactLoaderForTest");
}


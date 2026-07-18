/**
 * * Builds manifest registry records from installed plugin index snapshots.
 * 移植自 openclaw/src/plugins/manifest-registry-installed.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export function clearInstalledManifestRegistryProcessCaches(...args: unknown[]): unknown {
  throw new Error("not implemented: clearInstalledManifestRegistryProcessCaches");
}

export function resolveInstalledManifestRegistryIndexFingerprint(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveInstalledManifestRegistryIndexFingerprint");
}

export function loadPluginManifestRegistryForInstalledIndex(...args: unknown[]): unknown {
  throw new Error("not implemented: loadPluginManifestRegistryForInstalledIndex");
}


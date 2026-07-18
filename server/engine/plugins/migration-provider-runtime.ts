/**
 * Runtime bridge for plugin-provided migration hooks.
 * 移植自 openclaw/src/plugins/migration-provider-runtime.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export function ensureStandaloneMigrationProviderRegistryLoaded(...args: unknown[]): unknown {
  throw new Error("not implemented: ensureStandaloneMigrationProviderRegistryLoaded");
}

export function resolvePluginMigrationProvider(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePluginMigrationProvider");
}

export function resolvePluginMigrationProviders(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePluginMigrationProviders");
}


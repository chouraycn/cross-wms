/**
 * Maintains plugin setup entries discovered from manifests and light exports.
 * 移植自 openclaw/src/plugins/setup-registry.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type PluginSetupRegistryDiagnosticCode = unknown;

export type PluginSetupRegistryDiagnostic = unknown;

export function clearPluginSetupRegistryCache(...args: unknown[]): unknown {
  throw new Error("not implemented: clearPluginSetupRegistryCache");
}

export function setPluginSetupRegistryModuleLoaderFactoryForTest(...args: unknown[]): unknown {
  throw new Error("not implemented: setPluginSetupRegistryModuleLoaderFactoryForTest");
}

export function resolvePluginSetupRegistry(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePluginSetupRegistry");
}

export function resolvePluginSetupProvider(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePluginSetupProvider");
}

export function resolvePluginSetupCliBackend(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePluginSetupCliBackend");
}

export function runPluginSetupConfigMigrations(...args: unknown[]): unknown {
  throw new Error("not implemented: runPluginSetupConfigMigrations");
}

export function resolvePluginSetupAutoEnableReasons(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePluginSetupAutoEnableReasons");
}


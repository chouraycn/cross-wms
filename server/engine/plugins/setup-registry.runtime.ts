/**
 * * Runtime lookup helpers for plugin setup CLI backend descriptors.
 * 移植自 openclaw/src/plugins/setup-registry.runtime.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

const testing: unknown = undefined;
export { testing as __testing_setup_registry_runtime };

export function resolvePluginSetupCliBackendDescriptor(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePluginSetupCliBackendDescriptor");
}

export function resolvePluginSetupCliBackendRuntime(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePluginSetupCliBackendRuntime");
}



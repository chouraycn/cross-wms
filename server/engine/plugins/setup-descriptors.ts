/**
 * Builds setup descriptors from plugin provider and manifest metadata.
 * 移植自 openclaw/src/plugins/setup-descriptors.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export function listSetupProviderIds(...args: unknown[]): unknown {
  throw new Error("not implemented: listSetupProviderIds");
}

export function listSetupCliBackendIds(...args: unknown[]): unknown {
  throw new Error("not implemented: listSetupCliBackendIds");
}


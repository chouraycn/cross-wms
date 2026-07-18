/**
 * Normalizes plugin tool contracts from manifest metadata.
 * 移植自 openclaw/src/plugins/tool-contracts.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export function normalizePluginToolContractNames(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizePluginToolContractNames");
}

export function normalizePluginToolNames(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizePluginToolNames");
}

export function findUndeclaredPluginToolNames(...args: unknown[]): unknown {
  throw new Error("not implemented: findUndeclaredPluginToolNames");
}


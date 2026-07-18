/**
 * * Builds agent tools registered by plugins, preserving plugin scope around callbacks and descriptors.
 * 移植自 openclaw/src/plugins/tools.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */


export type PluginToolMcpMeta = unknown;

export type PluginToolMeta = unknown;

export function setPluginToolMeta(...args: unknown[]): unknown {
  throw new Error("not implemented: setPluginToolMeta");
}

export function getPluginToolMeta(...args: unknown[]): unknown {
  throw new Error("not implemented: getPluginToolMeta");
}

export function copyPluginToolMeta(...args: unknown[]): unknown {
  throw new Error("not implemented: copyPluginToolMeta");
}

export function buildPluginToolMetadataKey(...args: unknown[]): unknown {
  throw new Error("not implemented: buildPluginToolMetadataKey");
}

export function ensureStandalonePluginToolRegistryLoaded(...args: unknown[]): unknown {
  throw new Error("not implemented: ensureStandalonePluginToolRegistryLoaded");
}

export function resolvePluginTools(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePluginTools");
}


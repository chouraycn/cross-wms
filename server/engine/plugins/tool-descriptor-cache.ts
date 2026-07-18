/**
 * * Caches plugin tool descriptors by plugin source, contract names, and runtime context.
 * 移植自 openclaw/src/plugins/tool-descriptor-cache.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type CachedPluginToolDescriptor = unknown;

export type PluginToolDescriptorConfigCacheKeyMemo = unknown;

export function createPluginToolDescriptorConfigCacheKeyMemo(...args: unknown[]): unknown {
  throw new Error("not implemented: createPluginToolDescriptorConfigCacheKeyMemo");
}

export function resetPluginToolDescriptorCache(...args: unknown[]): unknown {
  throw new Error("not implemented: resetPluginToolDescriptorCache");
}

export function buildPluginToolDescriptorCacheKey(...args: unknown[]): unknown {
  throw new Error("not implemented: buildPluginToolDescriptorCacheKey");
}

export function capturePluginToolDescriptor(...args: unknown[]): unknown {
  throw new Error("not implemented: capturePluginToolDescriptor");
}

export function readCachedPluginToolDescriptors(...args: unknown[]): unknown {
  throw new Error("not implemented: readCachedPluginToolDescriptors");
}

export function writeCachedPluginToolDescriptors(...args: unknown[]): unknown {
  throw new Error("not implemented: writeCachedPluginToolDescriptors");
}


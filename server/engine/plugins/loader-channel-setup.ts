/**
 * Builds channel setup metadata from plugin light surfaces.
 * 移植自 openclaw/src/plugins/loader-channel-setup.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export function mergeSetupRuntimeChannelPlugin(...args: unknown[]): unknown {
  throw new Error("not implemented: mergeSetupRuntimeChannelPlugin");
}

export type BundledRuntimeChannelRegistration = unknown;

export function resolveBundledRuntimeChannelRegistration(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveBundledRuntimeChannelRegistration");
}

export function loadBundledRuntimeChannelPlugin(...args: unknown[]): unknown {
  throw new Error("not implemented: loadBundledRuntimeChannelPlugin");
}

export function resolveSetupChannelRegistration(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveSetupChannelRegistration");
}

export function shouldLoadChannelPluginInSetupRuntime(...args: unknown[]): unknown {
  throw new Error("not implemented: shouldLoadChannelPluginInSetupRuntime");
}

export function shouldDeferConfiguredChannelFullRuntimeMerge(...args: unknown[]): unknown {
  throw new Error("not implemented: shouldDeferConfiguredChannelFullRuntimeMerge");
}

export function channelPluginIdBelongsToManifest(...args: unknown[]): unknown {
  throw new Error("not implemented: channelPluginIdBelongsToManifest");
}


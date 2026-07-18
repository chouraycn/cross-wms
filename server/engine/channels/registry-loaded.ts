// 移植自 openclaw/src/channels/plugins/registry-loaded.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type LoadedChannelPlugin = unknown;

export type LoadedChannelPluginEntry = unknown;

export function listLoadedChannelPlugins(..._args: unknown[]): unknown {
  throw new Error("not implemented: listLoadedChannelPlugins");
}

export function getLoadedChannelPluginById(..._args: unknown[]): unknown {
  throw new Error("not implemented: getLoadedChannelPluginById");
}

export function getLoadedChannelPluginEntryById(..._args: unknown[]): unknown {
  throw new Error("not implemented: getLoadedChannelPluginEntryById");
}

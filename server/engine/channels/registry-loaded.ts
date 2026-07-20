// 移植自 openclaw/src/channels/plugins/registry-loaded.ts

export type LoadedChannelPlugin = unknown;

export type LoadedChannelPluginEntry = unknown;

export function listLoadedChannelPlugins(..._args: unknown[]): unknown {
  return [];
}

export function getLoadedChannelPluginById(..._args: unknown[]): unknown {
  return undefined;
}

export function getLoadedChannelPluginEntryById(..._args: unknown[]): unknown {
  return undefined;
}

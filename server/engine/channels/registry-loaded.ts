// 移植自 openclaw/src/channels/plugins/registry-loaded.ts

export type LoadedChannelPlugin = unknown;

export type LoadedChannelPluginEntry = unknown;

export function listLoadedChannelPlugins(..._args: any[]): any {
  return [];
}

export function getLoadedChannelPluginById(..._args: any[]): any {
  return undefined;
}

export function getLoadedChannelPluginEntryById(..._args: any[]): any {
  return undefined;
}

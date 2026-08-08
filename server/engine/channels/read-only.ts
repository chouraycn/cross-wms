// 移植自 openclaw/src/channels/plugins/read-only.ts

export function listPluginLoaderModuleCandidateUrls(..._args: any[]): any {
  return [];
}

export type ReadOnlyChannelPluginLoadFailure = unknown;

export const resolveReadOnlyChannelCommandDefaults: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;

export function listReadOnlyChannelPluginsForConfig(..._args: any[]): any {
  return [];
}

export function resolveReadOnlyChannelPluginsForConfig(..._args: any[]): any {
  return undefined;
}

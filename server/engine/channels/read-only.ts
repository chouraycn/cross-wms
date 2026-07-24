// 移植自 openclaw/src/channels/plugins/read-only.ts

export function listPluginLoaderModuleCandidateUrls(..._args: unknown[]): unknown {
  return [];
}

export type ReadOnlyChannelPluginLoadFailure = unknown;

export const resolveReadOnlyChannelCommandDefaults: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;

export function listReadOnlyChannelPluginsForConfig(..._args: unknown[]): unknown {
  return [];
}

export function resolveReadOnlyChannelPluginsForConfig(..._args: unknown[]): unknown {
  return undefined;
}

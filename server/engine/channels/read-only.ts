// 移植自 openclaw/src/channels/plugins/read-only.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function listPluginLoaderModuleCandidateUrls(..._args: unknown[]): unknown {
  throw new Error("not implemented: listPluginLoaderModuleCandidateUrls");
}

export type ReadOnlyChannelPluginLoadFailure = unknown;

export const resolveReadOnlyChannelCommandDefaults: unknown = undefined;

export function listReadOnlyChannelPluginsForConfig(..._args: unknown[]): unknown {
  throw new Error("not implemented: listReadOnlyChannelPluginsForConfig");
}

export function resolveReadOnlyChannelPluginsForConfig(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveReadOnlyChannelPluginsForConfig");
}

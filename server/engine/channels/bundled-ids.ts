// 移植自 openclaw/src/channels/plugins/bundled-ids.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function listBundledChannelPluginIdsForRoot(..._args: unknown[]): unknown {
  throw new Error("not implemented: listBundledChannelPluginIdsForRoot");
}

export function listBundledChannelIdsForRoot(..._args: unknown[]): unknown {
  throw new Error("not implemented: listBundledChannelIdsForRoot");
}

export function listBundledChannelPluginIds(..._args: unknown[]): unknown {
  throw new Error("not implemented: listBundledChannelPluginIds");
}

export function listBundledChannelIds(..._args: unknown[]): unknown {
  throw new Error("not implemented: listBundledChannelIds");
}

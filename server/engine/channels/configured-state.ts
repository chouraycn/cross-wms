// 移植自 openclaw/src/channels/plugins/configured-state.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function listBundledChannelIdsWithConfiguredState(..._args: unknown[]): unknown {
  throw new Error("not implemented: listBundledChannelIdsWithConfiguredState");
}

export function hasBundledChannelConfiguredState(..._args: unknown[]): unknown {
  throw new Error("not implemented: hasBundledChannelConfiguredState");
}

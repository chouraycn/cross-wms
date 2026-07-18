// 移植自 openclaw/src/channels/plugins/package-state-probes.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function listBundledChannelIdsForPackageState(..._args: unknown[]): unknown {
  throw new Error("not implemented: listBundledChannelIdsForPackageState");
}

export function hasBundledChannelPackageState(..._args: unknown[]): unknown {
  throw new Error("not implemented: hasBundledChannelPackageState");
}

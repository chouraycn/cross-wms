// 移植自 openclaw/src/channels/plugins/contracts/test-helpers/channel-catalog-contract.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function describeChannelCatalogEntryContract(..._args: unknown[]): unknown {
  throw new Error("not implemented: describeChannelCatalogEntryContract");
}

export function describeBundledMetadataOnlyChannelCatalogContract(..._args: unknown[]): unknown {
  throw new Error("not implemented: describeBundledMetadataOnlyChannelCatalogContract");
}

export function describeOfficialFallbackChannelCatalogContract(..._args: unknown[]): unknown {
  throw new Error("not implemented: describeOfficialFallbackChannelCatalogContract");
}

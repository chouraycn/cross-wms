// 移植自 openclaw/src/channels/plugins/contracts/test-helpers/channel-catalog-contract.ts
// 降级：channel plugin contract 测试辅助

export type ChannelCatalogContractDescription = {
  provider: string;
  requiredCapabilities: string[];
  optionalCapabilities: string[];
};

/** Describes the contract for a channel catalog entry. */
export function describeChannelCatalogEntryContract(params: { provider: string }): ChannelCatalogContractDescription {
  return { provider: params.provider, requiredCapabilities: [], optionalCapabilities: [] };
}

/** Describes the contract for a bundled metadata-only channel. */
export function describeBundledMetadataOnlyChannelCatalogContract(params: { provider: string }): ChannelCatalogContractDescription {
  return { provider: params.provider, requiredCapabilities: [], optionalCapabilities: [] };
}

/** Describes the contract for the official fallback channel. */
export function describeOfficialFallbackChannelCatalogContract(): ChannelCatalogContractDescription {
  return { provider: "official-fallback", requiredCapabilities: [], optionalCapabilities: [] };
}

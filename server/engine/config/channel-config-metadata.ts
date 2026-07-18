// 移植自 openclaw/src/config/channel-config-metadata.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ChannelSchemaMetadataWithOwnership = unknown;
export type ChannelDmPolicyMetadata = unknown;
export function collectPluginSchemaMetadata(...args: unknown[]): unknown {
  throw new Error("not implemented: collectPluginSchemaMetadata");
}
export function collectChannelSchemaMetadataWithOwnership(...args: unknown[]): unknown {
  throw new Error("not implemented: collectChannelSchemaMetadataWithOwnership");
}
export function collectChannelSchemaMetadata(...args: unknown[]): unknown {
  throw new Error("not implemented: collectChannelSchemaMetadata");
}
export function collectChannelDmPolicyMetadata(...args: unknown[]): unknown {
  throw new Error("not implemented: collectChannelDmPolicyMetadata");
}

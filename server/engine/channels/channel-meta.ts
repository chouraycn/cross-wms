// 移植自 openclaw/src/channels/plugins/channel-meta.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function buildManifestChannelMeta(..._args: unknown[]): unknown {
  throw new Error("not implemented: buildManifestChannelMeta");
}

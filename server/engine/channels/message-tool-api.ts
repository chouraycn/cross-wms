// 移植自 openclaw/src/channels/plugins/message-tool-api.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ChannelMessageToolDiscoveryAdapter = unknown;

export function resolveBundledChannelMessageToolDiscoveryAdapter(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveBundledChannelMessageToolDiscoveryAdapter");
}

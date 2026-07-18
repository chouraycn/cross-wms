// 移植自 openclaw/src/channels/plugins/outbound/load.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export async function loadChannelOutboundAdapter(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: loadChannelOutboundAdapter");
}

export type LoadChannelOutboundAdapter = unknown;

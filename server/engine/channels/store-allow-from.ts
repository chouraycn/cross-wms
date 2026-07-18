// 移植自 openclaw/src/channels/message-access/store-allow-from.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export async function readChannelIngressStoreAllowFromForDmPolicy(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: readChannelIngressStoreAllowFromForDmPolicy");
}

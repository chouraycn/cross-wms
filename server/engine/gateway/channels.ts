// 移植自 openclaw/src/gateway/server-methods/channels.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export async function logoutChannelAccount(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: logoutChannelAccount");
}

export async function startChannelAccount(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: startChannelAccount");
}

export async function stopChannelAccount(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: stopChannelAccount");
}

export const channelsHandlers: unknown = undefined;

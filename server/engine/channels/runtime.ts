// 移植自 openclaw/src/channels/message-access/runtime.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function createChannelIngressResolver(..._args: unknown[]): unknown {
  throw new Error("not implemented: createChannelIngressResolver");
}

export async function resolveStableChannelMessageIngress(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: resolveStableChannelMessageIngress");
}

export function channelIngressRoutes(..._args: unknown[]): unknown {
  throw new Error("not implemented: channelIngressRoutes");
}

export async function resolveChannelMessageIngress(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: resolveChannelMessageIngress");
}

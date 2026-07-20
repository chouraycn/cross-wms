// 移植自 openclaw/src/channels/message-access/runtime.ts

export function createChannelIngressResolver(..._args: unknown[]): unknown {
  return undefined;
}

export async function resolveStableChannelMessageIngress(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}

export function channelIngressRoutes(..._args: unknown[]): unknown {
  return undefined;
}

export async function resolveChannelMessageIngress(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}

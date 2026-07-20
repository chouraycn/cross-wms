// 移植自 openclaw/src/channels/plugins/outbound/load.ts

export async function loadChannelOutboundAdapter(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}

export type LoadChannelOutboundAdapter = unknown;

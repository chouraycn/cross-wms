// 移植自 openclaw/src/channels/plugins/outbound/load.ts

export async function loadChannelOutboundAdapter(..._args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}

export type LoadChannelOutboundAdapter = unknown;

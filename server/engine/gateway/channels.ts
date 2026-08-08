// 移植自 openclaw/src/gateway/server-methods/channels.ts

export async function logoutChannelAccount(...args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}

export async function startChannelAccount(...args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}

export async function stopChannelAccount(...args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}

export const channelsHandlers: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;

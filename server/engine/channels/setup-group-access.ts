// 移植自 openclaw/src/channels/plugins/setup-group-access.ts

export type ChannelAccessPolicy = unknown;

export function parseAllowlistEntries(..._args: any[]): any {
  return undefined;
}

export function formatAllowlistEntries(..._args: any[]): any {
  return "";
}

export async function promptChannelAccessPolicy(..._args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}

export async function promptChannelAllowlist(..._args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}

export async function promptChannelAccessConfig(..._args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}

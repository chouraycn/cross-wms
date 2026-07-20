// 移植自 openclaw/src/channels/plugins/setup-group-access.ts

export type ChannelAccessPolicy = unknown;

export function parseAllowlistEntries(..._args: unknown[]): unknown {
  return undefined;
}

export function formatAllowlistEntries(..._args: unknown[]): unknown {
  return "";
}

export async function promptChannelAccessPolicy(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}

export async function promptChannelAllowlist(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}

export async function promptChannelAccessConfig(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}

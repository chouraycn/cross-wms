// 移植自 openclaw/src/channels/plugins/setup-group-access.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ChannelAccessPolicy = unknown;

export function parseAllowlistEntries(..._args: unknown[]): unknown {
  throw new Error("not implemented: parseAllowlistEntries");
}

export function formatAllowlistEntries(..._args: unknown[]): unknown {
  throw new Error("not implemented: formatAllowlistEntries");
}

export async function promptChannelAccessPolicy(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: promptChannelAccessPolicy");
}

export async function promptChannelAllowlist(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: promptChannelAllowlist");
}

export async function promptChannelAccessConfig(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: promptChannelAccessConfig");
}

// 移植自 openclaw/src/infra/channel-selection.ts
// 降级：channel plugin / config 依赖简化

export type MessageChannelId = string;
export type MessageChannelSelectionSource = "config" | "bootstrap" | "auto" | "explicit";

/** Checks if a channel is configured. */
export function isConfiguredChannel(_cfg: unknown, _channel: string): boolean {
  // Simplified: no real config access
  return false;
}

/** Lists configured message channels. */
export async function listConfiguredMessageChannels(_cfg: unknown): Promise<string[]> {
  // Simplified: no real config access
  return [];
}

/** Resolves the message channel selection. */
export function resolveMessageChannelSelection(params: {
  channel?: string;
  cfg?: unknown;
}): { channel: string; source: MessageChannelSelectionSource } | null {
  if (!params.channel?.trim()) return null;
  return { channel: params.channel.trim(), source: "explicit" };
}

export const testing_channel_selection = { isConfiguredChannel, listConfiguredMessageChannels, resolveMessageChannelSelection };
export type __testing_channel_selection = typeof testing_channel_selection;

import { logger } from "../../logger.js";
import type { ChannelId, AccountId } from "../../channels/types.js";

export type StatusType =
  | "online"
  | "offline"
  | "away"
  | "busy"
  | "typing"
  | "processing"
  | "error";

export interface StatusReactionConfig {
  channelId: ChannelId;
  enabled: boolean;
  statusEmojis: Record<StatusType, string>;
}

const statusConfigs = new Map<ChannelId, StatusReactionConfig>();

const defaultEmojis: Record<StatusType, string> = {
  online: "🟢",
  offline: "⚫",
  away: "🟡",
  busy: "🔴",
  typing: "⌨️",
  processing: "⏳",
  error: "⚠️",
};

export function configureStatusReactions(config: Partial<StatusReactionConfig> & { channelId: ChannelId }): void {
  const merged: StatusReactionConfig = {
    channelId: config.channelId,
    enabled: config.enabled ?? true,
    statusEmojis: { ...defaultEmojis, ...config.statusEmojis },
  };
  statusConfigs.set(config.channelId, merged);
  logger.debug(`[Channels:StatusReactions] Configured for ${config.channelId}`);
}

export function getStatusReactionConfig(channelId: ChannelId): StatusReactionConfig {
  return statusConfigs.get(channelId) ?? {
    channelId,
    enabled: true,
    statusEmojis: { ...defaultEmojis },
  };
}

export function areStatusReactionsEnabled(channelId: ChannelId): boolean {
  return getStatusReactionConfig(channelId).enabled;
}

export function getStatusEmoji(channelId: ChannelId, status: StatusType): string | undefined {
  const config = getStatusReactionConfig(channelId);
  if (!config.enabled) return undefined;
  return config.statusEmojis[status];
}

export type StatusHandler = (params: {
  channelId: ChannelId;
  accountId?: AccountId;
  target?: string;
  status: StatusType;
  emoji: string;
  text?: string;
}) => Promise<void> | void;

let statusHandler: StatusHandler | null = null;

export function setStatusHandler(handler: StatusHandler): void {
  statusHandler = handler;
}

export async function sendStatusUpdate(params: {
  channelId: ChannelId;
  accountId?: AccountId;
  target?: string;
  status: StatusType;
  text?: string;
}): Promise<boolean> {
  const emoji = getStatusEmoji(params.channelId, params.status);
  if (!emoji) return false;

  if (statusHandler) {
    try {
      await statusHandler({
        ...params,
        emoji,
      });
      return true;
    } catch (err) {
      logger.error(`[Channels:StatusReactions] Handler error`, { error: err });
      return false;
    }
  }

  return false;
}

export function removeStatusReactionConfig(channelId: ChannelId): boolean {
  return statusConfigs.delete(channelId);
}

export function clearStatusReactionConfigs(): void {
  statusConfigs.clear();
}

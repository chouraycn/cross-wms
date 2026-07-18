import { logger } from "../../logger.js";
import type { ChannelId, AccountId } from "../../channels/types.js";

export type AckType = "received" | "processing" | "success" | "failed";

export interface AckReactionConfig {
  channelId: ChannelId;
  enabled: boolean;
  receivedEmoji?: string;
  processingEmoji?: string;
  successEmoji?: string;
  failedEmoji?: string;
}

const ackConfigs = new Map<ChannelId, AckReactionConfig>();

const defaultConfig: Omit<AckReactionConfig, "channelId"> = {
  enabled: true,
  receivedEmoji: "👀",
  processingEmoji: "⚡",
  successEmoji: "✅",
  failedEmoji: "❌",
};

export function configureAckReactions(config: AckReactionConfig): void {
  ackConfigs.set(config.channelId, config);
  logger.debug(`[Channels:AckReactions] Configured for ${config.channelId}`);
}

export function getAckReactionConfig(channelId: ChannelId): AckReactionConfig {
  return ackConfigs.get(channelId) ?? {
    channelId,
    ...defaultConfig,
  };
}

export function areAckReactionsEnabled(channelId: ChannelId): boolean {
  return getAckReactionConfig(channelId).enabled;
}

export function getAckEmoji(channelId: ChannelId, type: AckType): string | undefined {
  const config = getAckReactionConfig(channelId);
  if (!config.enabled) return undefined;

  switch (type) {
    case "received":
      return config.receivedEmoji;
    case "processing":
      return config.processingEmoji;
    case "success":
      return config.successEmoji;
    case "failed":
      return config.failedEmoji;
    default:
      return undefined;
  }
}

export type AckReactionHandler = (params: {
  channelId: ChannelId;
  accountId?: AccountId;
  messageId: string;
  emoji: string;
  type: AckType;
}) => Promise<void> | void;

let ackHandler: AckReactionHandler | null = null;

export function setAckReactionHandler(handler: AckReactionHandler): void {
  ackHandler = handler;
}

export async function sendAckReaction(params: {
  channelId: ChannelId;
  accountId?: AccountId;
  messageId: string;
  type: AckType;
}): Promise<boolean> {
  const emoji = getAckEmoji(params.channelId, params.type);
  if (!emoji) return false;

  if (ackHandler) {
    try {
      await ackHandler({
        ...params,
        emoji,
      });
      logger.debug(
        `[Channels:AckReactions] Sent ${params.type} ack for ${params.messageId}`
      );
      return true;
    } catch (err) {
      logger.error(`[Channels:AckReactions] Handler error`, { error: err });
      return false;
    }
  }

  return false;
}

export function removeAckReactionConfig(channelId: ChannelId): boolean {
  return ackConfigs.delete(channelId);
}

export function clearAckReactionConfigs(): void {
  ackConfigs.clear();
}

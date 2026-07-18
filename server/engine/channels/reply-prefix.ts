import { logger } from "../../logger.js";
import type { ChannelId } from "../../channels/types.js";

export interface ReplyPrefixConfig {
  channelId: ChannelId;
  enabled: boolean;
  prefix?: string;
  suffix?: string;
  includeChannelName?: boolean;
  includeTimestamp?: boolean;
  format?: "plain" | "markdown" | "html";
}

const prefixConfigs = new Map<ChannelId, ReplyPrefixConfig>();

const defaultConfig: Omit<ReplyPrefixConfig, "channelId"> = {
  enabled: false,
  format: "plain",
};

export function configureReplyPrefix(config: ReplyPrefixConfig): void {
  prefixConfigs.set(config.channelId, config);
  logger.debug(`[Channels:ReplyPrefix] Configured for ${config.channelId}`);
}

export function getReplyPrefixConfig(channelId: ChannelId): ReplyPrefixConfig {
  return prefixConfigs.get(channelId) ?? {
    channelId,
    ...defaultConfig,
  };
}

export function isReplyPrefixEnabled(channelId: ChannelId): boolean {
  return getReplyPrefixConfig(channelId).enabled;
}

export function applyReplyPrefix(
  content: string,
  channelId: ChannelId,
  options?: {
    channelName?: string;
    timestamp?: number;
  }
): string {
  const config = getReplyPrefixConfig(channelId);
  if (!config.enabled) return content;

  let result = content;
  const prefixParts: string[] = [];

  if (config.prefix) {
    prefixParts.push(config.prefix);
  }

  if (config.includeChannelName && options?.channelName) {
    prefixParts.push(`[${options.channelName}]`);
  }

  if (config.includeTimestamp && options?.timestamp) {
    const time = new Date(options.timestamp).toLocaleTimeString();
    prefixParts.push(`[${time}]`);
  }

  if (prefixParts.length > 0) {
    const separator = config.format === "markdown" ? " " : " ";
    result = prefixParts.join(separator) + " " + result;
  }

  if (config.suffix) {
    result = result + " " + config.suffix;
  }

  return result;
}

export function stripReplyPrefix(content: string, channelId: ChannelId): string {
  const config = getReplyPrefixConfig(channelId);
  if (!config.enabled) return content;

  let result = content;

  if (config.prefix && result.startsWith(config.prefix)) {
    result = result.slice(config.prefix.length).trimStart();
  }

  if (config.suffix && result.endsWith(config.suffix)) {
    result = result.slice(0, -config.suffix.length).trimEnd();
  }

  return result;
}

export function setReplyPrefix(channelId: ChannelId, prefix: string): void {
  const config = getReplyPrefixConfig(channelId);
  config.prefix = prefix;
  config.enabled = true;
  prefixConfigs.set(channelId, config);
}

export function setReplySuffix(channelId: ChannelId, suffix: string): void {
  const config = getReplyPrefixConfig(channelId);
  config.suffix = suffix;
  config.enabled = true;
  prefixConfigs.set(channelId, config);
}

export function removeReplyPrefixConfig(channelId: ChannelId): boolean {
  return prefixConfigs.delete(channelId);
}

export function clearReplyPrefixConfigs(): void {
  prefixConfigs.clear();
}

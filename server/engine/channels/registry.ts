import { logger } from "../../logger.js";
import type { ChannelId, ChannelMeta, ChannelCapabilities, AppConfig } from "../../channels/types.js";
import type { ChannelPlugin } from "../../channels/plugin.js";

const channelRegistry = new Map<ChannelId, ChannelPlugin>();

export function registerChannel(plugin: ChannelPlugin): void {
  channelRegistry.set(plugin.id, plugin);
  logger.debug(`[Channels:Registry] Registered channel: ${plugin.id}`);
}

export function unregisterChannel(channelId: ChannelId): boolean {
  const deleted = channelRegistry.delete(channelId);
  if (deleted) {
    logger.debug(`[Channels:Registry] Unregistered channel: ${channelId}`);
  }
  return deleted;
}

export function getChannel(channelId: ChannelId): ChannelPlugin | undefined {
  return channelRegistry.get(channelId);
}

export function getChannelOrThrow(channelId: ChannelId): ChannelPlugin {
  const plugin = channelRegistry.get(channelId);
  if (!plugin) {
    throw new Error(`Channel not found: ${channelId}`);
  }
  return plugin;
}

export function hasChannel(channelId: ChannelId): boolean {
  return channelRegistry.has(channelId);
}

export function listChannels(): ChannelPlugin[] {
  return Array.from(channelRegistry.values());
}

export function listEnabledChannels(config: AppConfig): ChannelPlugin[] {
  return Array.from(channelRegistry.values()).filter((plugin) => {
    const accountIds = plugin.config.listAccountIds(config);
    return accountIds.some((accountId) => {
      const account = plugin.config.resolveAccount(config, accountId);
      return account && plugin.config.isEnabled(account, config);
    });
  });
}

export function getChannelMeta(channelId: ChannelId): ChannelMeta | undefined {
  return channelRegistry.get(channelId)?.meta;
}

export function getChannelCapabilities(channelId: ChannelId): ChannelCapabilities | undefined {
  return channelRegistry.get(channelId)?.capabilities;
}

export function findChannelByAlias(alias: string): ChannelPlugin | undefined {
  const normalized = alias.toLowerCase();
  for (const plugin of channelRegistry.values()) {
    if (plugin.meta.aliases?.includes(normalized)) {
      return plugin;
    }
  }
  return undefined;
}

export function clearRegistry(): void {
  channelRegistry.clear();
  logger.debug(`[Channels:Registry] Registry cleared`);
}

export function getRegistryCount(): number {
  return channelRegistry.size;
}

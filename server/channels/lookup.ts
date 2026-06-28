/**
 * Channel plugin lookup utilities.
 *
 * Provides convenient functions for looking up channel plugins from the registry.
 */
import type { ChannelId, ChannelMeta, AppConfig } from "./types.js";
import type { ChannelPlugin } from "./plugin.js";
import { getChannelRegistry } from "./registry.js";

/**
 * Gets the metadata for a registered channel plugin.
 */
export function getRegisteredChannelPluginMeta(channelId: ChannelId): ChannelMeta | null {
  const registry = getChannelRegistry();
  return registry.getMeta(channelId) ?? null;
}

/**
 * Gets a registered channel plugin by its id.
 */
export function getRegisteredChannelPlugin(channelId: ChannelId): ChannelPlugin | null {
  const registry = getChannelRegistry();
  return registry.get(channelId) ?? null;
}

/**
 * Lists all registered channel plugins.
 */
export function listAllRegisteredChannelPlugins(): ChannelPlugin[] {
  const registry = getChannelRegistry();
  return registry.listAll();
}

/**
 * Lists all enabled channel plugins based on the provided config.
 */
export function listEnabledChannelPlugins(config: AppConfig): ChannelPlugin[] {
  const registry = getChannelRegistry();
  return registry.listEnabled(config);
}

/**
 * Finds a channel plugin by alias.
 */
export function findChannelPluginByAlias(alias: string): ChannelPlugin | null {
  const registry = getChannelRegistry();
  return registry.findByAlias(alias) ?? null;
}

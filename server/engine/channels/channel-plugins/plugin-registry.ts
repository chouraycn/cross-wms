import { logger } from "../../../logger.js";
import type { PluginId, RegisteredPlugin, PluginDefinition, PluginConfig, PluginStatus } from "./types.js";

const pluginRegistry = new Map<PluginId, RegisteredPlugin>();

export function registerPlugin(
  definition: PluginDefinition,
  config: PluginConfig = {}
): RegisteredPlugin {
  const registered: RegisteredPlugin = {
    definition,
    status: config.enabled !== false ? "enabled" : "disabled",
    config,
    context: {
      logger,
      config: config.settings ?? {},
      channelId: definition.metadata.id,
    },
  };

  pluginRegistry.set(definition.metadata.id, registered);
  logger.debug(`[ChannelPlugins:Registry] Registered plugin: ${definition.metadata.id}`);
  return registered;
}

export function unregisterPlugin(pluginId: PluginId): boolean {
  const deleted = pluginRegistry.delete(pluginId);
  if (deleted) {
    logger.debug(`[ChannelPlugins:Registry] Unregistered plugin: ${pluginId}`);
  }
  return deleted;
}

export function getPlugin(pluginId: PluginId): RegisteredPlugin | undefined {
  return pluginRegistry.get(pluginId);
}

export function getPluginOrThrow(pluginId: PluginId): RegisteredPlugin {
  const plugin = pluginRegistry.get(pluginId);
  if (!plugin) {
    throw new Error(`Plugin not found: ${pluginId}`);
  }
  return plugin;
}

export function hasPlugin(pluginId: PluginId): boolean {
  return pluginRegistry.has(pluginId);
}

export function listPlugins(status?: PluginStatus): RegisteredPlugin[] {
  const plugins = Array.from(pluginRegistry.values());
  if (status) {
    return plugins.filter((p) => p.status === status);
  }
  return plugins;
}

export function getPluginMetadata(pluginId: PluginId) {
  return pluginRegistry.get(pluginId)?.definition.metadata;
}

export function updatePluginStatus(pluginId: PluginId, status: PluginStatus): boolean {
  const plugin = pluginRegistry.get(pluginId);
  if (!plugin) return false;
  plugin.status = status;
  logger.debug(`[ChannelPlugins:Registry] Updated plugin ${pluginId} status: ${status}`);
  return true;
}

export function updatePluginConfig(pluginId: PluginId, config: Partial<PluginConfig>): boolean {
  const plugin = pluginRegistry.get(pluginId);
  if (!plugin) return false;
  plugin.config = { ...plugin.config, ...config };
  logger.debug(`[ChannelPlugins:Registry] Updated plugin ${pluginId} config`);
  return true;
}

export function clearPluginRegistry(): void {
  pluginRegistry.clear();
  logger.debug(`[ChannelPlugins:Registry] Registry cleared`);
}

export function getPluginCount(): number {
  return pluginRegistry.size;
}
import { logger } from "../../../logger.js";
import type { PluginId, PluginDefinition, PluginContext, RegisteredPlugin, PluginConfig } from "./types.js";

export interface PluginFactoryOptions {
  cache?: boolean;
  defaultConfig?: PluginConfig;
}

const pluginFactories = new Map<PluginId, () => Promise<PluginDefinition>>();
const createdInstances = new Map<PluginId, RegisteredPlugin>();

export function registerPluginFactory(
  pluginId: PluginId,
  factory: () => Promise<PluginDefinition>
): void {
  pluginFactories.set(pluginId, factory);
  logger.debug(`[ChannelPlugins:Factory] Registered factory for ${pluginId}`);
}

export async function createPlugin(
  pluginId: PluginId,
  context: Partial<PluginContext> = {},
  options: PluginFactoryOptions = {}
): Promise<RegisteredPlugin> {
  const { cache = true, defaultConfig = {} } = options;

  if (cache && createdInstances.has(pluginId)) {
    logger.debug(`[ChannelPlugins:Factory] Returning cached instance for ${pluginId}`);
    return createdInstances.get(pluginId)!;
  }

  const factory = pluginFactories.get(pluginId);
  if (!factory) {
    throw new Error(`No factory registered for plugin: ${pluginId}`);
  }

  try {
    logger.debug(`[ChannelPlugins:Factory] Creating plugin ${pluginId}`);
    const definition = await factory();

    const registered: RegisteredPlugin = {
      definition,
      status: defaultConfig.enabled !== false ? "enabled" : "disabled",
      config: defaultConfig,
      context: {
        logger,
        config: defaultConfig.settings ?? {},
        channelId: pluginId,
        ...context,
      },
    };

    if (cache) {
      createdInstances.set(pluginId, registered);
    }

    logger.debug(`[ChannelPlugins:Factory] Created ${pluginId} successfully`);
    return registered;
  } catch (error) {
    logger.error(`[ChannelPlugins:Factory] Failed to create ${pluginId}`, { error });
    throw error;
  }
}

export function getCreatedPlugin(pluginId: PluginId): RegisteredPlugin | undefined {
  return createdInstances.get(pluginId);
}

export function isPluginCreated(pluginId: PluginId): boolean {
  return createdInstances.has(pluginId);
}

export function destroyPlugin(pluginId: PluginId): boolean {
  logger.debug(`[ChannelPlugins:Factory] Destroying plugin ${pluginId}`);
  return createdInstances.delete(pluginId);
}

export function clearCreatedPlugins(): void {
  createdInstances.clear();
  logger.debug(`[ChannelPlugins:Factory] All created plugins cleared`);
}

export function getCreatedPluginCount(): number {
  return createdInstances.size;
}
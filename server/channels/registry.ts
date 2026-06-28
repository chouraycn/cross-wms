/**
 * Channel registry.
 *
 * Provides channel plugin lookup and management.
 */
import type { ChannelId, ChannelMeta, AppConfig } from "./types.js";
import type { ChannelPlugin } from "./plugin.js";

/**
 * Channel registry interface for looking up and managing channel plugins.
 */
export interface ChannelRegistry {
  /**
   * Gets a channel plugin by channel ID.
   */
  get(channelId: ChannelId): ChannelPlugin | undefined;

  /**
   * Gets a channel plugin by channel ID, throwing if not found.
   */
  getOrThrow(channelId: ChannelId): ChannelPlugin;

  /**
   * Gets channel metadata by channel ID.
   */
  getMeta(channelId: ChannelId): ChannelMeta | undefined;

  /**
   * Lists all registered channel plugins.
   */
  listAll(): ChannelPlugin[];

  /**
   * Lists all enabled channel plugins based on config.
   */
  listEnabled(config: AppConfig): ChannelPlugin[];

  /**
   * Finds a channel plugin by alias.
   */
  findByAlias(alias: string): ChannelPlugin | undefined;

  /**
   * Checks if a channel is registered.
   */
  has(channelId: ChannelId): boolean;

  /**
   * Registers a channel plugin.
   */
  register(plugin: ChannelPlugin): void;

  /**
   * Unregisters a channel plugin.
   */
  unregister(channelId: ChannelId): void;
}

/**
 * Simple in-memory channel registry implementation.
 */
export class InMemoryChannelRegistry implements ChannelRegistry {
  private readonly plugins = new Map<ChannelId, ChannelPlugin>();

  get(channelId: ChannelId): ChannelPlugin | undefined {
    return this.plugins.get(channelId);
  }

  getOrThrow(channelId: ChannelId): ChannelPlugin {
    const plugin = this.plugins.get(channelId);
    if (!plugin) {
      throw new Error(`Channel plugin not found: ${channelId}`);
    }
    return plugin;
  }

  getMeta(channelId: ChannelId): ChannelMeta | undefined {
    return this.plugins.get(channelId)?.meta;
  }

  listAll(): ChannelPlugin[] {
    return Array.from(this.plugins.values());
  }

  listEnabled(config: AppConfig): ChannelPlugin[] {
    return Array.from(this.plugins.values()).filter((plugin) => {
      const accountIds = plugin.config.listAccountIds(config);
      return accountIds.some((accountId) => {
        const account = plugin.config.resolveAccount(config, accountId);
        return account && plugin.config.isEnabled(account, config);
      });
    });
  }

  findByAlias(alias: string): ChannelPlugin | undefined {
    const normalizedAlias = alias.toLowerCase();
    for (const plugin of this.plugins.values()) {
      if (plugin.meta.aliases?.includes(normalizedAlias)) {
        return plugin;
      }
    }
    return undefined;
  }

  has(channelId: ChannelId): boolean {
    return this.plugins.has(channelId);
  }

  register(plugin: ChannelPlugin): void {
    this.plugins.set(plugin.id, plugin);
  }

  unregister(channelId: ChannelId): void {
    this.plugins.delete(channelId);
  }
}

/**
 * Global channel registry instance.
 */
let globalRegistry: ChannelRegistry | undefined;

/**
 * Gets the global channel registry instance.
 */
export function getGlobalChannelRegistry(): ChannelRegistry {
  if (!globalRegistry) {
    globalRegistry = new InMemoryChannelRegistry();
  }
  return globalRegistry;
}

/**
 * Gets the channel registry (alias for getGlobalChannelRegistry).
 */
export function getChannelRegistry(): ChannelRegistry {
  return getGlobalChannelRegistry();
}

/**
 * Sets the global channel registry instance.
 */
export function setGlobalChannelRegistry(registry: ChannelRegistry): void {
  globalRegistry = registry;
}

/**
 * Parameters for creating a channel plugin.
 */
export interface CreateChannelPluginParams {
  id: ChannelId;
  meta: ChannelMeta;
  capabilities: ChannelPlugin["capabilities"];
  config: ChannelPlugin["config"];
  configSchema?: ChannelPlugin["configSchema"];
  message?: ChannelPlugin["message"];
  auth?: ChannelPlugin["auth"];
  security?: ChannelPlugin["security"];
  status?: ChannelPlugin["status"];
  lifecycle?: ChannelPlugin["lifecycle"];
  agentTools?: ChannelPlugin["agentTools"];
}

/**
 * Creates a channel plugin from the provided parameters.
 */
export function createChannelPlugin(params: CreateChannelPluginParams): ChannelPlugin {
  return {
    id: params.id,
    meta: params.meta,
    capabilities: params.capabilities,
    config: params.config,
    configSchema: params.configSchema,
    message: params.message,
    auth: params.auth,
    security: params.security,
    status: params.status,
    lifecycle: params.lifecycle,
    agentTools: params.agentTools,
  };
}

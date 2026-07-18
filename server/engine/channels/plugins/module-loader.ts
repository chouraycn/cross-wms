import { logger } from "../../../logger.js";
import type { ChannelId } from "../../../channels/types.js";
import type { ChannelPlugin } from "../../../channels/plugin.js";

export interface ModuleLoaderOptions {
  cache?: boolean;
  timeoutMs?: number;
}

const loadedModules = new Map<ChannelId, ChannelPlugin>();
const loadingPromises = new Map<ChannelId, Promise<ChannelPlugin>>();

export async function loadChannelModule(
  channelId: ChannelId,
  loader: () => Promise<ChannelPlugin>,
  options: ModuleLoaderOptions = {}
): Promise<ChannelPlugin> {
  const { cache = true } = options;

  if (cache && loadedModules.has(channelId)) {
    logger.debug(`[Plugins:ModuleLoader] Returning cached module for ${channelId}`);
    return loadedModules.get(channelId)!;
  }

  if (loadingPromises.has(channelId)) {
    logger.debug(`[Plugins:ModuleLoader] Awaiting in-progress load for ${channelId}`);
    return loadingPromises.get(channelId)!;
  }

  const promise = (async () => {
    try {
      logger.debug(`[Plugins:ModuleLoader] Loading module for ${channelId}`);
      const plugin = await loader();

      if (cache) {
        loadedModules.set(channelId, plugin);
      }

      logger.debug(`[Plugins:ModuleLoader] Loaded ${channelId} successfully`);
      return plugin;
    } catch (err) {
      logger.error(`[Plugins:ModuleLoader] Failed to load ${channelId}`, { error: err });
      throw err;
    } finally {
      loadingPromises.delete(channelId);
    }
  })();

  loadingPromises.set(channelId, promise);
  return promise;
}

export function getLoadedModule(channelId: ChannelId): ChannelPlugin | undefined {
  return loadedModules.get(channelId);
}

export function isModuleLoaded(channelId: ChannelId): boolean {
  return loadedModules.has(channelId);
}

export function isModuleLoading(channelId: ChannelId): boolean {
  return loadingPromises.has(channelId);
}

export function unloadChannelModule(channelId: ChannelId): boolean {
  logger.debug(`[Plugins:ModuleLoader] Unloading module ${channelId}`);
  return loadedModules.delete(channelId);
}

export function clearLoadedModules(): void {
  loadedModules.clear();
  logger.debug(`[Plugins:ModuleLoader] All modules cleared`);
}

export function getLoadedModuleCount(): number {
  return loadedModules.size;
}

export function listLoadedModules(): ChannelId[] {
  return Array.from(loadedModules.keys());
}

export function createLazyPluginLoader(
  channelId: ChannelId,
  importFn: () => Promise<{ default: ChannelPlugin } | ChannelPlugin>
): () => Promise<ChannelPlugin> {
  return async () => {
    const module = await importFn();
    if ("default" in module && module.default) {
      return module.default;
    }
    return module as ChannelPlugin;
  };
}

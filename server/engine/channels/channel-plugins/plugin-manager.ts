import { logger } from "../../../logger.js";
import type { PluginId, RegisteredPlugin, PluginConfig, PluginHookContext, PluginHookType, PluginStatus } from "./types.js";
import { registerPlugin, getPlugin, updatePluginStatus, listPlugins } from "./plugin-registry.js";
import { emitHook, getHookHandlers } from "./plugin-hooks.js";
import { checkPermissions, requestPermission } from "./plugin-permissions.js";
import { createSandbox, executeInSandbox } from "./plugin-sandbox.js";

export async function initializePlugin(pluginId: PluginId, config?: Partial<PluginConfig>): Promise<RegisteredPlugin | null> {
  const plugin = getPlugin(pluginId);
  if (!plugin) {
    logger.error(`[ChannelPlugins:Manager] Plugin not found: ${pluginId}`);
    return null;
  }

  if (config) {
    plugin.config = { ...plugin.config, ...config };
    plugin.context.config = { ...plugin.context.config, ...(config.settings ?? {}) };
  }

  try {
    await emitHook({
      pluginId,
      hookType: "beforeInitialize",
      context: plugin.context,
    });

    if (plugin.definition.initialize) {
      const sandbox = createSandbox();
      await executeInSandbox(
        () => plugin.definition.initialize!(plugin.context),
        sandbox
      );
    }

    plugin.status = "enabled";
    logger.info(`[ChannelPlugins:Manager] Initialized plugin: ${pluginId}`);

    await emitHook({
      pluginId,
      hookType: "afterInitialize",
      context: plugin.context,
    });

    return plugin;
  } catch (error) {
    plugin.status = "error";
    plugin.error = (error as Error).message;
    logger.error(`[ChannelPlugins:Manager] Failed to initialize ${pluginId}`, { error });

    await emitHook({
      pluginId,
      hookType: "onError",
      data: { error },
      context: plugin.context,
    });

    return plugin;
  }
}

export async function shutdownPlugin(pluginId: PluginId): Promise<void> {
  const plugin = getPlugin(pluginId);
  if (!plugin) {
    logger.warn(`[ChannelPlugins:Manager] Plugin not found: ${pluginId}`);
    return;
  }

  try {
    if (plugin.definition.shutdown) {
      const sandbox = createSandbox();
      await executeInSandbox(
        () => plugin.definition.shutdown!(plugin.context),
        sandbox
      );
    }

    await emitHook({
      pluginId,
      hookType: "onShutdown",
      context: plugin.context,
    });

    plugin.status = "disabled";
    logger.info(`[ChannelPlugins:Manager] Shutdown plugin: ${pluginId}`);
  } catch (error) {
    logger.error(`[ChannelPlugins:Manager] Failed to shutdown ${pluginId}`, { error });
  }
}

export async function initializeAllPlugins(): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  for (const plugin of listPlugins()) {
    if (plugin.status === "enabled" || plugin.status === "installed") {
      const result = await initializePlugin(plugin.definition.metadata.id);
      if (result?.status === "enabled") {
        success++;
      } else {
        failed++;
      }
    }
  }

  logger.info(`[ChannelPlugins:Manager] Initialized ${success} plugins, ${failed} failed`);
  return { success, failed };
}

export async function shutdownAllPlugins(): Promise<void> {
  for (const plugin of listPlugins()) {
    await shutdownPlugin(plugin.definition.metadata.id);
  }
  logger.info(`[ChannelPlugins:Manager] All plugins shutdown`);
}

export async function executePluginHook(
  hookType: PluginHookType,
  data?: unknown,
  filter?: (plugin: RegisteredPlugin) => boolean
): Promise<void> {
  const plugins = listPlugins().filter(filter ?? (() => true));

  for (const plugin of plugins) {
    if (plugin.status !== "enabled") continue;

    const handlers = getHookHandlers(hookType);
    for (const handler of handlers) {
      try {
        await handler({
          pluginId: plugin.definition.metadata.id,
          hookType,
          data,
          context: plugin.context,
        });
      } catch (error) {
        logger.error(`[ChannelPlugins:Manager] Hook ${hookType} failed for ${plugin.definition.metadata.id}`, { error });
      }
    }
  }
}

export async function ensurePluginPermissions(pluginId: PluginId): Promise<boolean> {
  const plugin = getPlugin(pluginId);
  if (!plugin) return false;

  const permissions = plugin.definition.permissions ?? [];
  for (const permission of permissions) {
    if (!checkPermissions(pluginId, permission.id)) {
      const granted = await requestPermission(pluginId, permission);
      if (!granted) {
        logger.warn(`[ChannelPlugins:Manager] Permission denied: ${permission.id} for ${pluginId}`);
        return false;
      }
    }
  }

  return true;
}

export function getPluginStatus(pluginId: PluginId): PluginStatus | undefined {
  return getPlugin(pluginId)?.status;
}

export function togglePlugin(pluginId: PluginId): boolean {
  const plugin = getPlugin(pluginId);
  if (!plugin) return false;

  const newStatus: PluginStatus = plugin.status === "enabled" ? "disabled" : "enabled";
  return updatePluginStatus(pluginId, newStatus);
}
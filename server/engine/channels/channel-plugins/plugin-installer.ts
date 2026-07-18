import { logger } from "../../../logger.js";
import type { PluginId, PluginMetadata, PluginInstallOptions, PluginInstallationResult } from "./types.js";

const installedPlugins = new Map<PluginId, PluginMetadata>();

export async function installPlugin(
  pluginId: PluginId,
  options: PluginInstallOptions = {}
): Promise<PluginInstallationResult> {
  try {
    logger.info(`[ChannelPlugins:Installer] Installing plugin: ${pluginId}`);

    if (installedPlugins.has(pluginId) && !options.force) {
      logger.warn(`[ChannelPlugins:Installer] Plugin ${pluginId} already installed`);
      return { success: false, error: "Plugin already installed" };
    }

    const metadata: PluginMetadata = {
      id: pluginId,
      name: pluginId,
      version: options.version ?? "1.0.0",
    };

    installedPlugins.set(pluginId, metadata);
    logger.info(`[ChannelPlugins:Installer] Installed plugin: ${pluginId}`);

    return {
      success: true,
      pluginId,
      installedDependencies: [],
    };
  } catch (error) {
    logger.error(`[ChannelPlugins:Installer] Failed to install ${pluginId}`, { error });
    return {
      success: false,
      pluginId,
      error: (error as Error).message,
    };
  }
}

export async function uninstallPlugin(pluginId: PluginId): Promise<boolean> {
  try {
    logger.info(`[ChannelPlugins:Installer] Uninstalling plugin: ${pluginId}`);
    const deleted = installedPlugins.delete(pluginId);

    if (deleted) {
      logger.info(`[ChannelPlugins:Installer] Uninstalled plugin: ${pluginId}`);
    } else {
      logger.warn(`[ChannelPlugins:Installer] Plugin ${pluginId} not found`);
    }

    return deleted;
  } catch (error) {
    logger.error(`[ChannelPlugins:Installer] Failed to uninstall ${pluginId}`, { error });
    return false;
  }
}

export function getInstalledPlugins(): PluginMetadata[] {
  return Array.from(installedPlugins.values());
}

export function isPluginInstalled(pluginId: PluginId): boolean {
  return installedPlugins.has(pluginId);
}

export function getInstalledPlugin(pluginId: PluginId): PluginMetadata | undefined {
  return installedPlugins.get(pluginId);
}

export async function updatePlugin(
  pluginId: PluginId,
  options: PluginInstallOptions = {}
): Promise<PluginInstallationResult> {
  const current = installedPlugins.get(pluginId);
  if (!current) {
    return { success: false, error: "Plugin not installed" };
  }

  return installPlugin(pluginId, { ...options, force: true });
}

export async function installPluginsFromConfig(
  pluginIds: PluginId[],
  options: PluginInstallOptions = {}
): Promise<{ success: PluginId[]; failed: PluginId[] }> {
  const success: PluginId[] = [];
  const failed: PluginId[] = [];

  for (const pluginId of pluginIds) {
    const result = await installPlugin(pluginId, options);
    if (result.success) {
      success.push(pluginId);
    } else {
      failed.push(pluginId);
    }
  }

  return { success, failed };
}

export function clearInstalledPlugins(): void {
  installedPlugins.clear();
  logger.info(`[ChannelPlugins:Installer] All plugins cleared`);
}
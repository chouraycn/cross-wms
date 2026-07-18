import type { PluginId, RegisteredPlugin, PluginMetadata, PluginStatus, PluginConfig, PluginPermission } from "./types.js";
import { registerPlugin, unregisterPlugin, getPlugin, listPlugins, updatePluginStatus, updatePluginConfig } from "./plugin-registry.js";
import { initializePlugin, shutdownPlugin, initializeAllPlugins, shutdownAllPlugins, togglePlugin, ensurePluginPermissions } from "./plugin-manager.js";
import { installPlugin, uninstallPlugin, getInstalledPlugins } from "./plugin-installer.js";

export interface PluginApi {
  register(definition: RegisteredPlugin["definition"], config?: PluginConfig): RegisteredPlugin;
  unregister(pluginId: PluginId): boolean;
  get(pluginId: PluginId): RegisteredPlugin | undefined;
  list(status?: PluginStatus): RegisteredPlugin[];
  initialize(pluginId: PluginId, config?: Partial<PluginConfig>): Promise<RegisteredPlugin | null>;
  shutdown(pluginId: PluginId): Promise<void>;
  initializeAll(): Promise<{ success: number; failed: number }>;
  shutdownAll(): Promise<void>;
  toggle(pluginId: PluginId): boolean;
  updateStatus(pluginId: PluginId, status: PluginStatus): boolean;
  updateConfig(pluginId: PluginId, config: Partial<PluginConfig>): boolean;
  install(options: { pluginId: PluginId; source?: string }): Promise<boolean>;
  uninstall(pluginId: PluginId): Promise<boolean>;
  getInstalled(): PluginMetadata[];
  ensurePermissions(pluginId: PluginId): Promise<boolean>;
}

export const pluginApi: PluginApi = {
  register: (definition, config) => registerPlugin(definition, config),
  unregister: (pluginId) => unregisterPlugin(pluginId),
  get: (pluginId) => getPlugin(pluginId),
  list: (status) => listPlugins(status),
  initialize: (pluginId, config) => initializePlugin(pluginId, config),
  shutdown: (pluginId) => shutdownPlugin(pluginId),
  initializeAll: () => initializeAllPlugins(),
  shutdownAll: () => shutdownAllPlugins(),
  toggle: (pluginId) => togglePlugin(pluginId),
  updateStatus: (pluginId, status) => updatePluginStatus(pluginId, status),
  updateConfig: (pluginId, config) => updatePluginConfig(pluginId, config),
  install: async (options) => {
    const result = await installPlugin(options.pluginId, { source: options.source });
    return result.success;
  },
  uninstall: async (pluginId) => {
    await shutdownPlugin(pluginId);
    return uninstallPlugin(pluginId);
  },
  getInstalled: () => getInstalledPlugins(),
  ensurePermissions: (pluginId) => ensurePluginPermissions(pluginId),
};

export function createPluginApi(): PluginApi {
  return { ...pluginApi };
}

export type { PluginId, RegisteredPlugin, PluginMetadata, PluginStatus, PluginConfig, PluginPermission };
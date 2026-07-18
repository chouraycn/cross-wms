export type {
  PluginId,
  PluginVersion,
  PluginStatus,
  PluginHookType,
  PluginMetadata,
  PluginConfig,
  PluginContext,
  PluginHookContext,
  PluginHookHandler,
  PluginHookRegistration,
  PluginPermission,
  PluginSandboxOptions,
  PluginInstallOptions,
  PluginInstallationResult,
  PluginDefinition,
  RegisteredPlugin,
} from "./types.js";

export {
  PluginMetadataSchema,
  PluginConfigSchema,
  PluginPermissionSchema,
} from "./types.js";

export {
  registerPlugin,
  unregisterPlugin,
  getPlugin,
  getPluginOrThrow,
  hasPlugin,
  listPlugins,
  getPluginMetadata,
  updatePluginStatus,
  updatePluginConfig,
  clearPluginRegistry,
  getPluginCount,
} from "./plugin-registry.js";

export {
  registerPluginFactory,
  createPlugin,
  getCreatedPlugin,
  isPluginCreated,
  destroyPlugin,
  clearCreatedPlugins,
  getCreatedPluginCount,
} from "./plugin-factory.js";

export {
  initializePlugin,
  shutdownPlugin,
  initializeAllPlugins,
  shutdownAllPlugins,
  executePluginHook,
  ensurePluginPermissions,
  getPluginStatus,
  togglePlugin,
} from "./plugin-manager.js";

export { pluginApi, createPluginApi, type PluginApi } from "./plugin-api.js";

export {
  registerHook,
  unregisterHook,
  getHookHandlers,
  emitHook,
  emitHooks,
  clearHooks,
  getHookCount,
} from "./plugin-hooks.js";

export {
  registerPluginPermissions,
  getPluginPermissions,
  checkPermissions,
  hasAllPermissions,
  grantPermission,
  grantPermissions,
  revokePermission,
  requestPermission,
  clearPluginPermissions,
  clearAllPermissions,
  getGrantedPermissions,
  hasAnyPermission,
} from "./plugin-permissions.js";

export {
  createSandbox,
  executeInSandbox,
  createContextSanitizer,
  createModuleLoader,
  type PluginSandbox,
} from "./plugin-sandbox.js";

export {
  installPlugin,
  uninstallPlugin,
  getInstalledPlugins,
  isPluginInstalled,
  getInstalledPlugin,
  updatePlugin,
  installPluginsFromConfig,
  clearInstalledPlugins,
} from "./plugin-installer.js";
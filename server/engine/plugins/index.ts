export { pluginRegistry } from '../pluginRegistry.js';

export {
  discoverPlugins,
  loadPlugin,
  loadAllPlugins,
  getLoadedPlugin,
  listLoadedPlugins,
  unloadPlugin,
  reloadPlugin,
  clearLoadedPlugins,
  installFromZip,
  installFromGit,
  installFromNpm,
} from '../pluginLoader.js';

export {
  validateManifest,
  parseManifest,
  normalizeManifest,
  generatePluginId,
  isManifestValid,
} from '../pluginManifest.js';

export {
  getPluginActivationState,
  setPluginActivationState,
  enablePlugin,
  disablePlugin,
  batchSetActivationState,
  listActivationRecords,
} from '../pluginActivation.js';

export { pluginManager } from '../pluginManager.js';

export { pluginHooks } from '../pluginHooks.js';

export { executeInSandbox } from '../pluginSandbox.js';

export { getInstalledPlugins, recordPluginInstall, removePluginInstallRecord } from './installs.js';
export type { PluginInstallRecord } from './installs.js';

export { resolvePluginRoots, getPluginRoot, addPluginRoot } from './roots.js';
export type { PluginRoot } from './roots.js';

export { getPluginStatus, getPluginStatuses, setPluginStatus } from './status.js';
export type { PluginStatus } from './status.js';

export { checkPluginUpdates, applyPluginUpdates } from './update.js';
export type { PluginUpdateInfo } from './update.js';

export {
  setPluginLoadState,
  getPluginLoadRecord,
  listLoadedPluginRecords,
  listFailedPlugins,
  setPluginDependencies,
  setPluginSource,
  clearPluginLoadRecord,
} from './loader-state.js';
export type { PluginLoadRecord, PluginLoadState } from './loader-state.js';

export {
  registerPluginHook,
  unregisterPluginHook,
  unregisterPluginHooksByPlugin,
  getHooksForName,
  getHooksByPlugin,
  enablePluginHook,
  disablePluginHook,
  listAllPluginHooks,
} from './hook-registry.js';
export type { PluginHookRegistration } from './hook-registry.js';

export {
  setPluginPermissionPolicy,
  getPluginPermissionPolicy,
  grantPluginPermission,
  denyPluginPermission,
  checkPluginPermission,
  clearPluginPermissions,
} from './permissions.js';
export type { PluginPermission, PluginPermissionPolicy } from './permissions.js';

export function setInstalledPluginIndexInstallRecords(..._args: unknown[]): unknown {
  console.warn('setInstalledPluginIndexInstallRecords is not available in cross-wms'); return undefined;
}

export async function runPluginsCommand(..._args: unknown[]): Promise<unknown> {
  console.warn('runPluginsCommand is not available in cross-wms');
}

export function resetPluginsCliTestState(..._args: unknown[]): unknown {
  console.warn('resetPluginsCliTestState is not available in cross-wms'); return undefined;
}

export class PromptInputClosedError extends Error {
  constructor(message = "Prompt input closed") {
    super(message);
    this.name = "PromptInputClosedError";
  }
}

export const loadConfig: unknown = undefined;
export const readConfigFileSnapshot: unknown = undefined;
export const readConfigFileSnapshotForWrite: unknown = undefined;
export const writeConfigFile: unknown = undefined;
export const replaceConfigFile: unknown = undefined;
export const installPluginFromMarketplace: unknown = undefined;
export const installPluginFromGitSpec: unknown = undefined;
export const enablePluginInConfig: unknown = undefined;
export const recordPluginInstall: unknown = undefined;
export const writePersistedInstalledPluginIndexInstallRecords: unknown = undefined;
export const loadPluginManifestRegistry: unknown = undefined;
export const buildPluginSnapshotReport: unknown = undefined;
export const buildPluginRegistrySnapshotReport: unknown = undefined;
export const buildPluginInspectReport: unknown = undefined;
export const buildPluginDiagnosticsReport: unknown = undefined;
export const inspectPluginRegistry: unknown = undefined;
export const refreshPluginRegistry: unknown = undefined;
export const clearPluginRegistryLoadCache: unknown = undefined;
export const applyExclusiveSlotSelection: unknown = undefined;
export const planPluginUninstall: unknown = undefined;
export const applyPluginUninstallDirectoryRemoval: unknown = undefined;
export const updateNpmInstalledPlugins: unknown = undefined;
export const updateNpmInstalledHookPacks: unknown = undefined;
export const promptYesNo: unknown = undefined;
export const installPluginFromNpmSpec: unknown = undefined;
export const installPluginFromNpmPackArchive: unknown = undefined;
export const installPluginFromPath: unknown = undefined;
export const installPluginFromClawHub: unknown = undefined;
export const parseClawHubPluginSpec: unknown = undefined;
export const findBundledPluginSourceMock: unknown = undefined;
export const installHooksFromNpmSpec: unknown = undefined;
export const installHooksFromPath: unknown = undefined;
export const recordHookInstall: unknown = undefined;
export const runtimeErrors: unknown = undefined;
export const runtimeLogs: unknown = undefined;
export const registerPluginsCli: unknown = undefined;

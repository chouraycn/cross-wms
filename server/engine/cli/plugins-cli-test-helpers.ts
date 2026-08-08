
export function setInstalledPluginIndexInstallRecords(..._args: any[]): any {
  console.warn('setInstalledPluginIndexInstallRecords is not available in cross-wms'); return undefined;
}

export async function runPluginsCommand(..._args: any[]): Promise<void> {
  console.warn('runPluginsCommand is not available in cross-wms');
}

export function resetPluginsCliTestState(..._args: any[]): any {
  console.warn('resetPluginsCliTestState is not available in cross-wms'); return undefined;
}

export class PromptInputClosedError extends Error {
  constructor(message = "Prompt input closed") {
    super(message);
    this.name = "PromptInputClosedError";
  }
}

export const loadConfig: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
export const readConfigFileSnapshot: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
export const readConfigFileSnapshotForWrite: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
export const writeConfigFile: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
export const replaceConfigFile: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
export const installPluginFromMarketplace: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
export const installPluginFromGitSpec: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
export const enablePluginInConfig: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
export const recordPluginInstall: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
export const writePersistedInstalledPluginIndexInstallRecords: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
export const loadPluginManifestRegistry: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
export const buildPluginSnapshotReport: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
export const buildPluginRegistrySnapshotReport: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
export const buildPluginInspectReport: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
export const buildPluginDiagnosticsReport: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
export const inspectPluginRegistry: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
export const refreshPluginRegistry: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
export const clearPluginRegistryLoadCache: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
export const applyExclusiveSlotSelection: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
export const planPluginUninstall: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
export const applyPluginUninstallDirectoryRemoval: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
export const updateNpmInstalledPlugins: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
export const updateNpmInstalledHookPacks: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
export const promptYesNo: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
export const installPluginFromNpmSpec: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
export const installPluginFromNpmPackArchive: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
export const installPluginFromPath: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
export const installPluginFromClawHub: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
export const parseClawHubPluginSpec: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
export const findBundledPluginSourceMock: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
export const installHooksFromNpmSpec: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
export const installHooksFromPath: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
export const recordHookInstall: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
export const runtimeErrors: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
export const runtimeLogs: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
export const registerPluginsCli: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;

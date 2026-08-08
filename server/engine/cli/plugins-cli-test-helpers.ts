
export function setInstalledPluginIndexInstallRecords(..._args: unknown[]): unknown {
  console.warn('setInstalledPluginIndexInstallRecords is not available in cross-wms'); return undefined;
}

export async function runPluginsCommand(..._args: unknown[]): Promise<void> {
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

export const loadConfig: (...args: unknown[]) => unknown = undefined as unknown as (...args: unknown[]) => unknown;
export const readConfigFileSnapshot: (...args: unknown[]) => unknown = undefined as unknown as (...args: unknown[]) => unknown;
export const readConfigFileSnapshotForWrite: (...args: unknown[]) => unknown = undefined as unknown as (...args: unknown[]) => unknown;
export const writeConfigFile: (...args: unknown[]) => unknown = undefined as unknown as (...args: unknown[]) => unknown;
export const replaceConfigFile: (...args: unknown[]) => unknown = undefined as unknown as (...args: unknown[]) => unknown;
export const installPluginFromMarketplace: (...args: unknown[]) => unknown = undefined as unknown as (...args: unknown[]) => unknown;
export const installPluginFromGitSpec: (...args: unknown[]) => unknown = undefined as unknown as (...args: unknown[]) => unknown;
export const enablePluginInConfig: (...args: unknown[]) => unknown = undefined as unknown as (...args: unknown[]) => unknown;
export const recordPluginInstall: (...args: unknown[]) => unknown = undefined as unknown as (...args: unknown[]) => unknown;
export const writePersistedInstalledPluginIndexInstallRecords: (...args: unknown[]) => unknown = undefined as unknown as (...args: unknown[]) => unknown;
export const loadPluginManifestRegistry: (...args: unknown[]) => unknown = undefined as unknown as (...args: unknown[]) => unknown;
export const buildPluginSnapshotReport: (...args: unknown[]) => unknown = undefined as unknown as (...args: unknown[]) => unknown;
export const buildPluginRegistrySnapshotReport: (...args: unknown[]) => unknown = undefined as unknown as (...args: unknown[]) => unknown;
export const buildPluginInspectReport: (...args: unknown[]) => unknown = undefined as unknown as (...args: unknown[]) => unknown;
export const buildPluginDiagnosticsReport: (...args: unknown[]) => unknown = undefined as unknown as (...args: unknown[]) => unknown;
export const inspectPluginRegistry: (...args: unknown[]) => unknown = undefined as unknown as (...args: unknown[]) => unknown;
export const refreshPluginRegistry: (...args: unknown[]) => unknown = undefined as unknown as (...args: unknown[]) => unknown;
export const clearPluginRegistryLoadCache: (...args: unknown[]) => unknown = undefined as unknown as (...args: unknown[]) => unknown;
export const applyExclusiveSlotSelection: (...args: unknown[]) => unknown = undefined as unknown as (...args: unknown[]) => unknown;
export const planPluginUninstall: (...args: unknown[]) => unknown = undefined as unknown as (...args: unknown[]) => unknown;
export const applyPluginUninstallDirectoryRemoval: (...args: unknown[]) => unknown = undefined as unknown as (...args: unknown[]) => unknown;
export const updateNpmInstalledPlugins: (...args: unknown[]) => unknown = undefined as unknown as (...args: unknown[]) => unknown;
export const updateNpmInstalledHookPacks: (...args: unknown[]) => unknown = undefined as unknown as (...args: unknown[]) => unknown;
export const promptYesNo: (...args: unknown[]) => unknown = undefined as unknown as (...args: unknown[]) => unknown;
export const installPluginFromNpmSpec: (...args: unknown[]) => unknown = undefined as unknown as (...args: unknown[]) => unknown;
export const installPluginFromNpmPackArchive: (...args: unknown[]) => unknown = undefined as unknown as (...args: unknown[]) => unknown;
export const installPluginFromPath: (...args: unknown[]) => unknown = undefined as unknown as (...args: unknown[]) => unknown;
export const installPluginFromClawHub: (...args: unknown[]) => unknown = undefined as unknown as (...args: unknown[]) => unknown;
export const parseClawHubPluginSpec: (...args: unknown[]) => unknown = undefined as unknown as (...args: unknown[]) => unknown;
export const findBundledPluginSourceMock: (...args: unknown[]) => unknown = undefined as unknown as (...args: unknown[]) => unknown;
export const installHooksFromNpmSpec: (...args: unknown[]) => unknown = undefined as unknown as (...args: unknown[]) => unknown;
export const installHooksFromPath: (...args: unknown[]) => unknown = undefined as unknown as (...args: unknown[]) => unknown;
export const recordHookInstall: (...args: unknown[]) => unknown = undefined as unknown as (...args: unknown[]) => unknown;
export const runtimeErrors: (...args: unknown[]) => unknown = undefined as unknown as (...args: unknown[]) => unknown;
export const runtimeLogs: (...args: unknown[]) => unknown = undefined as unknown as (...args: unknown[]) => unknown;
export const registerPluginsCli: (...args: unknown[]) => unknown = undefined as unknown as (...args: unknown[]) => unknown;

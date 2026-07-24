
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

export const loadConfig: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
export const readConfigFileSnapshot: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
export const readConfigFileSnapshotForWrite: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
export const writeConfigFile: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
export const replaceConfigFile: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
export const installPluginFromMarketplace: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
export const installPluginFromGitSpec: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
export const enablePluginInConfig: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
export const recordPluginInstall: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
export const writePersistedInstalledPluginIndexInstallRecords: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
export const loadPluginManifestRegistry: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
export const buildPluginSnapshotReport: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
export const buildPluginRegistrySnapshotReport: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
export const buildPluginInspectReport: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
export const buildPluginDiagnosticsReport: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
export const inspectPluginRegistry: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
export const refreshPluginRegistry: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
export const clearPluginRegistryLoadCache: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
export const applyExclusiveSlotSelection: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
export const planPluginUninstall: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
export const applyPluginUninstallDirectoryRemoval: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
export const updateNpmInstalledPlugins: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
export const updateNpmInstalledHookPacks: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
export const promptYesNo: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
export const installPluginFromNpmSpec: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
export const installPluginFromNpmPackArchive: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
export const installPluginFromPath: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
export const installPluginFromClawHub: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
export const parseClawHubPluginSpec: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
export const findBundledPluginSourceMock: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
export const installHooksFromNpmSpec: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
export const installHooksFromPath: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
export const recordHookInstall: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
export const runtimeErrors: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
export const runtimeLogs: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
export const registerPluginsCli: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;

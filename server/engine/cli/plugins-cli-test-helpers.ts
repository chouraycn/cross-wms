// 移植自 openclaw/src/cli/plugins-cli-test-helpers.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误
// 生成方式：自动 stub（保留导出名以便后续替换为正式实现）

export function setInstalledPluginIndexInstallRecords(..._args: unknown[]): unknown {
  throw new Error("not implemented: setInstalledPluginIndexInstallRecords");
}

export async function runPluginsCommand(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: runPluginsCommand");
}

export function resetPluginsCliTestState(..._args: unknown[]): unknown {
  throw new Error("not implemented: resetPluginsCliTestState");
}

export class PromptInputClosedError {
  constructor(..._args: unknown[]) {
    throw new Error("not implemented: PromptInputClosedError.constructor");
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

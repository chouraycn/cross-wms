// 移植自 openclaw/src/config/io.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ParseConfigJson5Result = unknown;
export type ConfigWriteResult = unknown;
export type ConfigWriteOptions = unknown;
export type ReadConfigFileSnapshotForWriteResult = unknown;
export type ConfigWriteNotification = unknown;
export type ConfigSnapshotReadMeasure = unknown;
export type ConfigIoDeps = unknown;
export type ConfigSnapshotReadOptions = unknown;
export type ReadConfigFileSnapshotWithPluginMetadataResult = unknown;
export type BestEffortConfigSnapshot = unknown;
export function resolveConfigSnapshotHash(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveConfigSnapshotHash");
}
export function parseConfigJson5(...args: unknown[]): unknown {
  throw new Error("not implemented: parseConfigJson5");
}
export function restoreEnvChangesIfUnchanged(...args: unknown[]): unknown {
  throw new Error("not implemented: restoreEnvChangesIfUnchanged");
}
export function createConfigIO(...args: unknown[]): unknown {
  throw new Error("not implemented: createConfigIO");
}
export function clearConfigCache(...args: unknown[]): unknown {
  throw new Error("not implemented: clearConfigCache");
}
export function registerConfigWriteListener(...args: unknown[]): unknown {
  throw new Error("not implemented: registerConfigWriteListener");
}
export function loadConfig(...args: unknown[]): unknown {
  throw new Error("not implemented: loadConfig");
}
export function getRuntimeConfig(...args: unknown[]): unknown {
  throw new Error("not implemented: getRuntimeConfig");
}
export function readBestEffortConfig(...args: unknown[]): unknown {
  throw new Error("not implemented: readBestEffortConfig");
}
export function readBestEffortConfigSnapshot(...args: unknown[]): unknown {
  throw new Error("not implemented: readBestEffortConfigSnapshot");
}
export function readSourceConfigBestEffort(...args: unknown[]): unknown {
  throw new Error("not implemented: readSourceConfigBestEffort");
}
export function readConfigFileSnapshot(...args: unknown[]): unknown {
  throw new Error("not implemented: readConfigFileSnapshot");
}
export function readConfigFileSnapshotWithPluginMetadata(...args: unknown[]): unknown {
  throw new Error("not implemented: readConfigFileSnapshotWithPluginMetadata");
}
export function promoteConfigSnapshotToLastKnownGood(...args: unknown[]): unknown {
  throw new Error("not implemented: promoteConfigSnapshotToLastKnownGood");
}
export function recoverConfigFromLastKnownGood(...args: unknown[]): unknown {
  throw new Error("not implemented: recoverConfigFromLastKnownGood");
}
export function recoverConfigFromJsonRootSuffix(...args: unknown[]): unknown {
  throw new Error("not implemented: recoverConfigFromJsonRootSuffix");
}
export function readSourceConfigSnapshot(...args: unknown[]): unknown {
  throw new Error("not implemented: readSourceConfigSnapshot");
}
export function readConfigFileSnapshotForWrite(...args: unknown[]): unknown {
  throw new Error("not implemented: readConfigFileSnapshotForWrite");
}
export function readSourceConfigSnapshotForWrite(...args: unknown[]): unknown {
  throw new Error("not implemented: readSourceConfigSnapshotForWrite");
}
export function writeConfigFile(...args: unknown[]): unknown {
  throw new Error("not implemented: writeConfigFile");
}
export class ConfigRuntimeRefreshError {
  constructor(...args: unknown[]) { throw new Error("not implemented: ConfigRuntimeRefreshError"); }
}
export type clearRuntimeConfigSnapshot = unknown;
export type getRuntimeConfigSnapshotMetadata = unknown;
export type getRuntimeConfigSnapshot = unknown;
export type getRuntimeConfigSourceSnapshot = unknown;
export type resetConfigRuntimeState = unknown;
export type resolveRuntimeConfigCacheKey = unknown;
export type selectApplicableRuntimeConfig = unknown;
export type setRuntimeConfigSnapshot = unknown;
export type setRuntimeConfigSnapshotRefreshHandler = unknown;
export type projectConfigOntoRuntimeSourceSnapshot = unknown;
export const projectConfigOntoRuntimeSourceSnapshot: unknown = undefined;
export type CircularIncludeError = unknown;
export const CircularIncludeError: unknown = undefined;
export type ConfigIncludeError = unknown;
export const ConfigIncludeError: unknown = undefined;
export type MissingEnvVarError = unknown;
export const MissingEnvVarError: unknown = undefined;
export type resolveShellEnvExpectedKeys = unknown;
export const resolveShellEnvExpectedKeys: unknown = undefined;

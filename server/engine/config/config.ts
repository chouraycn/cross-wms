// 移植自 openclaw/src/config/config.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type {
  SkillConfig,
  ClawHubConfig,
  RemoteSyncConfig,
  RemoteSyncNodeConfig,
  SecurityConfig,
  AgentFilterConfig,
} from '../skills/config/config-loader.js';

export {
  loadSkillConfig,
  getSkillConfig,
  watchSkillConfig,
  reloadSkillConfig,
  isConfigLoaded,
  getDefaultSkillConfig,
} from '../skills/config/config-loader.js';

export type ConfigWriteAfterWrite = unknown;
export type ConfigWriteFollowUp = unknown;
export type RuntimeConfigSnapshotMetadata = unknown;
export type BestEffortConfigSnapshot = unknown;
export type ConfigSnapshotReadOptions = unknown;
export type ConfigWriteNotification = unknown;
export type ConfigWriteResult = unknown;
export type ReadConfigFileSnapshotWithPluginMetadataResult = unknown;
export type ConfigMutationCommit = unknown;
export type ConfigMutationCommitParams = unknown;
export type ConfigMutationCommitResult = unknown;
export type ConfigMutationContext = unknown;
export type ConfigMutationIO = unknown;
export type ConfigReplaceResult = unknown;
export type ConfigMutationResult = unknown;
export type ConfigTransformResult = unknown;
export type TransformConfigFileParams = unknown;
export type TransformConfigFileWithRetryParams = unknown;
export type clearConfigCache = unknown;
export const clearConfigCache: any = undefined;
export type ConfigRuntimeRefreshError = unknown;
export const ConfigRuntimeRefreshError: any = undefined;
export type clearRuntimeConfigSnapshot = unknown;
export const clearRuntimeConfigSnapshot: any = undefined;
export type registerConfigWriteListener = unknown;
export const registerConfigWriteListener: any = undefined;
export type createConfigIO = unknown;
export const createConfigIO: any = undefined;
export type getRuntimeConfig = unknown;
export const getRuntimeConfig: any = undefined;
export type getRuntimeConfigSnapshotMetadata = unknown;
export const getRuntimeConfigSnapshotMetadata: any = undefined;
export type getRuntimeConfigSnapshot = unknown;
export const getRuntimeConfigSnapshot: any = undefined;
export type getRuntimeConfigSourceSnapshot = unknown;
export const getRuntimeConfigSourceSnapshot: any = undefined;
export type projectConfigOntoRuntimeSourceSnapshot = unknown;
export const projectConfigOntoRuntimeSourceSnapshot: any = undefined;
export type loadConfig = unknown;
export const loadConfig: any = undefined;
export type readBestEffortConfig = unknown;
export const readBestEffortConfig: any = undefined;
export type readBestEffortConfigSnapshot = unknown;
export const readBestEffortConfigSnapshot: any = undefined;
export type readSourceConfigBestEffort = unknown;
export const readSourceConfigBestEffort: any = undefined;
export type parseConfigJson5 = unknown;
export const parseConfigJson5: any = undefined;
export type promoteConfigSnapshotToLastKnownGood = unknown;
export const promoteConfigSnapshotToLastKnownGood: any = undefined;
export type readConfigFileSnapshot = unknown;
export const readConfigFileSnapshot: any = undefined;
export type readConfigFileSnapshotWithPluginMetadata = unknown;
export const readConfigFileSnapshotWithPluginMetadata: any = undefined;
export type readConfigFileSnapshotForWrite = unknown;
export const readConfigFileSnapshotForWrite: any = undefined;
export type readSourceConfigSnapshot = unknown;
export const readSourceConfigSnapshot: any = undefined;
export type readSourceConfigSnapshotForWrite = unknown;
export const readSourceConfigSnapshotForWrite: any = undefined;
export type recoverConfigFromLastKnownGood = unknown;
export const recoverConfigFromLastKnownGood: any = undefined;
export type recoverConfigFromJsonRootSuffix = unknown;
export const recoverConfigFromJsonRootSuffix: any = undefined;
export type resetConfigRuntimeState = unknown;
export const resetConfigRuntimeState: any = undefined;
export type resolveConfigSnapshotHash = unknown;
export const resolveConfigSnapshotHash: any = undefined;
export type resolveRuntimeConfigCacheKey = unknown;
export const resolveRuntimeConfigCacheKey: any = undefined;
export type selectApplicableRuntimeConfig = unknown;
export const selectApplicableRuntimeConfig: any = undefined;
export type setRuntimeConfigSnapshotRefreshHandler = unknown;
export const setRuntimeConfigSnapshotRefreshHandler: any = undefined;
export type setRuntimeConfigSnapshot = unknown;
export const setRuntimeConfigSnapshot: any = undefined;
export type writeConfigFile = unknown;
export const writeConfigFile: any = undefined;
export type hashRuntimeConfigValue = unknown;
export const hashRuntimeConfigValue: any = undefined;
export type resolveConfigWriteAfterWrite = unknown;
export const resolveConfigWriteAfterWrite: any = undefined;
export type resolveConfigWriteFollowUp = unknown;
export const resolveConfigWriteFollowUp: any = undefined;
export type ConfigMutationConflictError = unknown;
export const ConfigMutationConflictError: any = undefined;
export type mutateConfigFile = unknown;
export const mutateConfigFile: any = undefined;
export type mutateConfigFileWithRetry = unknown;
export const mutateConfigFileWithRetry: any = undefined;
export type replaceConfigFile = unknown;
export const replaceConfigFile: any = undefined;
export type transformConfigFile = unknown;
export const transformConfigFile: any = undefined;
export type transformConfigFileWithRetry = unknown;
export const transformConfigFileWithRetry: any = undefined;
export type assertConfigWriteAllowedInCurrentMode = unknown;
export const assertConfigWriteAllowedInCurrentMode: any = undefined;
export type NixModeConfigMutationError = unknown;
export const NixModeConfigMutationError: any = undefined;
export type validateConfigObject = unknown;
export const validateConfigObject: any = undefined;
export type validateConfigObjectRaw = unknown;
export const validateConfigObjectRaw: any = undefined;
export type validateConfigObjectRawWithPlugins = unknown;
export const validateConfigObjectRawWithPlugins: any = undefined;
export type validateConfigObjectWithPlugins = unknown;
export const validateConfigObjectWithPlugins: any = undefined;

export type { OpenClawConfig } from "./types.openclaw.js";

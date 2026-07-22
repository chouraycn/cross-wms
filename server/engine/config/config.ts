// 移植自 openclaw/src/config/config.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

import type {
  SkillConfig,
  ClawHubConfig,
  RemoteSyncConfig,
  RemoteSyncNodeConfig,
  SecurityConfig,
  AgentFilterConfig,
} from '../skills/config/config-loader.js';

export type SkillConfig = SkillConfig;
export type ClawHubConfig = ClawHubConfig;
export type RemoteSyncConfig = RemoteSyncConfig;
export type RemoteSyncNodeConfig = RemoteSyncNodeConfig;
export type SecurityConfig = SecurityConfig;
export type AgentFilterConfig = AgentFilterConfig;

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
export const clearConfigCache: unknown = undefined;
export type ConfigRuntimeRefreshError = unknown;
export const ConfigRuntimeRefreshError: unknown = undefined;
export type clearRuntimeConfigSnapshot = unknown;
export const clearRuntimeConfigSnapshot: unknown = undefined;
export type registerConfigWriteListener = unknown;
export const registerConfigWriteListener: unknown = undefined;
export type createConfigIO = unknown;
export const createConfigIO: unknown = undefined;
export type getRuntimeConfig = unknown;
export const getRuntimeConfig: unknown = undefined;
export type getRuntimeConfigSnapshotMetadata = unknown;
export const getRuntimeConfigSnapshotMetadata: unknown = undefined;
export type getRuntimeConfigSnapshot = unknown;
export const getRuntimeConfigSnapshot: unknown = undefined;
export type getRuntimeConfigSourceSnapshot = unknown;
export const getRuntimeConfigSourceSnapshot: unknown = undefined;
export type projectConfigOntoRuntimeSourceSnapshot = unknown;
export const projectConfigOntoRuntimeSourceSnapshot: unknown = undefined;
export type loadConfig = unknown;
export const loadConfig: unknown = undefined;
export type readBestEffortConfig = unknown;
export const readBestEffortConfig: unknown = undefined;
export type readBestEffortConfigSnapshot = unknown;
export const readBestEffortConfigSnapshot: unknown = undefined;
export type readSourceConfigBestEffort = unknown;
export const readSourceConfigBestEffort: unknown = undefined;
export type parseConfigJson5 = unknown;
export const parseConfigJson5: unknown = undefined;
export type promoteConfigSnapshotToLastKnownGood = unknown;
export const promoteConfigSnapshotToLastKnownGood: unknown = undefined;
export type readConfigFileSnapshot = unknown;
export const readConfigFileSnapshot: unknown = undefined;
export type readConfigFileSnapshotWithPluginMetadata = unknown;
export const readConfigFileSnapshotWithPluginMetadata: unknown = undefined;
export type readConfigFileSnapshotForWrite = unknown;
export const readConfigFileSnapshotForWrite: unknown = undefined;
export type readSourceConfigSnapshot = unknown;
export const readSourceConfigSnapshot: unknown = undefined;
export type readSourceConfigSnapshotForWrite = unknown;
export const readSourceConfigSnapshotForWrite: unknown = undefined;
export type recoverConfigFromLastKnownGood = unknown;
export const recoverConfigFromLastKnownGood: unknown = undefined;
export type recoverConfigFromJsonRootSuffix = unknown;
export const recoverConfigFromJsonRootSuffix: unknown = undefined;
export type resetConfigRuntimeState = unknown;
export const resetConfigRuntimeState: unknown = undefined;
export type resolveConfigSnapshotHash = unknown;
export const resolveConfigSnapshotHash: unknown = undefined;
export type resolveRuntimeConfigCacheKey = unknown;
export const resolveRuntimeConfigCacheKey: unknown = undefined;
export type selectApplicableRuntimeConfig = unknown;
export const selectApplicableRuntimeConfig: unknown = undefined;
export type setRuntimeConfigSnapshotRefreshHandler = unknown;
export const setRuntimeConfigSnapshotRefreshHandler: unknown = undefined;
export type setRuntimeConfigSnapshot = unknown;
export const setRuntimeConfigSnapshot: unknown = undefined;
export type writeConfigFile = unknown;
export const writeConfigFile: unknown = undefined;
export type hashRuntimeConfigValue = unknown;
export const hashRuntimeConfigValue: unknown = undefined;
export type resolveConfigWriteAfterWrite = unknown;
export const resolveConfigWriteAfterWrite: unknown = undefined;
export type resolveConfigWriteFollowUp = unknown;
export const resolveConfigWriteFollowUp: unknown = undefined;
export type ConfigMutationConflictError = unknown;
export const ConfigMutationConflictError: unknown = undefined;
export type mutateConfigFile = unknown;
export const mutateConfigFile: unknown = undefined;
export type mutateConfigFileWithRetry = unknown;
export const mutateConfigFileWithRetry: unknown = undefined;
export type replaceConfigFile = unknown;
export const replaceConfigFile: unknown = undefined;
export type transformConfigFile = unknown;
export const transformConfigFile: unknown = undefined;
export type transformConfigFileWithRetry = unknown;
export const transformConfigFileWithRetry: unknown = undefined;
export type assertConfigWriteAllowedInCurrentMode = unknown;
export const assertConfigWriteAllowedInCurrentMode: unknown = undefined;
export type NixModeConfigMutationError = unknown;
export const NixModeConfigMutationError: unknown = undefined;
export type validateConfigObject = unknown;
export const validateConfigObject: unknown = undefined;
export type validateConfigObjectRaw = unknown;
export const validateConfigObjectRaw: unknown = undefined;
export type validateConfigObjectRawWithPlugins = unknown;
export const validateConfigObjectRawWithPlugins: unknown = undefined;
export type validateConfigObjectWithPlugins = unknown;
export const validateConfigObjectWithPlugins: unknown = undefined;

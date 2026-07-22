export type {
  SkillConfigMutation,
  MutationHistory,
  MutationApplyOptions,
  RollbackResult,
} from './mutations.js';

export {
  recordMutation,
  getMutationHistory,
  getRecentMutations,
  applyConfigChange,
  rollbackToMutation,
  rollbackLastMutation,
  getCurrentConfig,
  compareConfigs,
  clearMutationHistory,
  saveMutationHistory,
  loadMutationHistory,
} from './mutations.js';

export type { DiffEntry } from './diff.js';

export {
  deepDiff,
  applyPatch,
  reversePatch,
} from './diff.js';

export type {
  SkillConfig,
  ClawHubConfig,
  RemoteSyncConfig,
  RemoteSyncNodeConfig,
  SecurityConfig,
  AgentFilterConfig,
} from './config-loader.js';

export {
  loadSkillConfig,
  getSkillConfig,
  watchSkillConfig,
  reloadSkillConfig,
  isConfigLoaded,
  getDefaultSkillConfig,
} from './config-loader.js';

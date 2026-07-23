export type {
  ChannelSetupContext,
  ChannelSetupResult,
  SetupStep,
} from "./setup-helpers.js";
export {
  registerSetupSteps,
  getSetupSteps,
  runSetup,
  getSetupStepState,
  resetSetup,
  isSetupComplete,
  createSetupMeta,
  defaultCapabilities,
} from "./setup-helpers.js";

export type {
  ConfigValidationResult,
  ConfigFieldMapping,
} from "./config-helpers.js";
export {
  createSimpleConfigAdapter,
  validateConfig,
  applyConfigDefaults,
  mergeChannelConfig,
  getChannelConfigValue,
  setChannelConfigValue,
  mapConfigFields,
  logConfigIssues,
} from "./config-helpers.js";

export type {
  ChannelDirectoryEntry,
  ChannelDirectoryAdapter,
} from "./directory-adapters.js";
export {
  registerDirectoryAdapter,
  unregisterDirectoryAdapter,
  getDirectoryAdapter,
  listDirectoryEntries,
  getDirectoryEntry,
  searchDirectory,
  getEntryMembers,
  hasDirectorySupport,
} from "./directory-adapters.js";

export type {
  ChannelAccount,
  AccountResolutionResult,
} from "./account-helpers.js";
export {
  listAccounts,
  resolveAccount,
  getDefaultAccount,
  isAccountEnabled,
  isAccountConfigured,
  getAccountName,
  clearAccountCache,
} from "./account-helpers.js";

export type { ModuleLoaderOptions } from "./module-loader.js";
export {
  loadChannelModule,
  getLoadedModule,
  isModuleLoaded,
  isModuleLoading,
  unloadChannelModule,
  clearLoadedModules,
  getLoadedModuleCount,
  listLoadedModules,
  createLazyPluginLoader,
} from "./module-loader.js";

export type {
  MessageActionType,
  MessageAction,
  MessageActionContext,
} from "./message-actions.js";
export {
  registerMessageActionHandler,
  unregisterMessageActionHandler,
  executeMessageAction,
  createMessageAction,
  addReactionAction,
  addReplyAction,
  addEditAction,
  addDeleteAction,
  addPinAction,
  addThreadAction,
  hasActionHandler,
  listAvailableActions,
} from "./message-actions.js";

export type {
  ChannelThread,
  ThreadResolutionResult,
} from "./threading-helpers.js";
export {
  createThread,
  getThread,
  updateThread,
  incrementThreadMessageCount,
  getOrCreateThread,
  setConversationThread,
  getConversationThread,
  listThreadsByChannel,
  deleteThread,
  clearThreads,
  resolveThreadFromMessage,
  isThreadActive,
} from "./threading-helpers.js";

export type {
  TargetType,
  ResolvedTarget,
  TargetResolutionOptions,
} from "./target-resolvers.js";
export {
  registerTargetResolver,
  unregisterTargetResolver,
  resolveTarget,
  createTarget,
  parseTargetString,
  formatTargetString,
  isDirectTarget,
  isGroupTarget,
  isThreadTarget,
  hasTargetResolver,
} from "./target-resolvers.js";

export type {
  PairingStatus,
  ChannelPairing,
  PairingRequest,
  PairingAdapter,
} from "./pairing-adapters.js";
export {
  registerPairingAdapter,
  unregisterPairingAdapter,
  getPairingAdapter,
  initiatePairing,
  confirmPairing,
  findPairing,
  getPairing,
  removePairing,
  isPaired,
  listPairings,
  clearPairings,
  hasPairingSupport,
} from "./pairing-adapters.js";

export type {
  WizardStepType,
  WizardField,
  WizardStep,
  WizardFlow,
  WizardFlowResult,
} from "./setup-wizard-flow.js";
export {
  registerWizardFlow,
  getWizardSteps,
  startWizardFlow,
  getWizardFlow,
  getCurrentStep,
  advanceWizardStep,
  goToPreviousStep,
  completeWizardFlow,
  cancelWizardFlow,
  isWizardComplete,
  getWizardProgress,
  clearWizardFlows,
} from "./setup-wizard-flow.js";

// 出站媒体负载构建器
export {
  buildMediaPayload,
  type MediaPayloadInput,
  type MediaPayload,
} from "./media-payload.js";

// 频道曝光助手 — 决定频道元数据可见性
export {
  resolveChannelExposure,
  isChannelVisibleInConfiguredLists,
  isChannelVisibleInSetup,
  type ChannelExposure,
  type ChannelExposureMeta,
} from "./exposure.js";

// Auto-generated stub exports (added by auto-fix-exports.mjs)
export const getLoadedChannelPlugin: any = undefined as any;
export const getChannelPlugin: any = undefined as any;
export const normalizeChannelId: any = undefined as any;

/** Lists currently loaded channel plugins (stub — returns empty array). */
export function listChannelPlugins(): import("../types.public.js").ChannelPlugin[] {
  return [];
}

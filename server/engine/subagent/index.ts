/**
 * Subagent 模块 — 子代理管理 barrel 导出
 *
 * 聚合子代理注册表、运行器、生命周期管理的公开 API，
 * 以及生成器、状态管理、公告系统、能力声明、控制接口、
 * 上下文管理和会话清理等核心功能。
 */

// ==================== 子代理注册表 ====================
export {
  getSubagentRegistry,
  registerSubagentDefinition,
  spawnSubagent,
  cancelSubagent,
  resetSubagentRegistryForTests,
} from "../subagentRegistry.js";
export type {
  SubagentStatus,
  SubagentDefinition,
  SubagentInstance,
  SpawnSubagentParams,
  SubagentSpawnResult,
  SubagentAvailableTools,
  SubagentRegistry,
} from "../subagentRegistry.js";

// ==================== 子代理运行器 ====================
export type {
  SubagentMode as RunnerSubagentMode,
  SubagentSandboxMode,
  SubagentContextMode,
  SubagentRunStatus,
  SubagentExecutionResult,
  SubagentEvent,
  SubagentEventListener,
  SubagentConfig,
  SubagentIsolationContext,
  SubagentMessage as RunnerSubagentMessage,
} from "../subagentRunner.js";
export {
  SubagentRunner,
  getSubagentRunner,
  executeSubagent,
} from "../subagentRunner.js";

// ==================== 子代理生命周期 ====================
export type {
  SubagentMode as LifecycleSubagentMode,
  SubagentStatus as LifecycleSubagentStatus,
  SubagentInfo,
  SubagentCreateOptions,
  SubagentLifecycleEvent,
  SubagentLifecycleListener,
} from "../subagent-lifecycle.js";
export {
  SubagentLifecycleManager,
  getGlobalSubagentLifecycleManager,
  setGlobalSubagentLifecycleManager,
  createSubagentLifecycleManager,
} from "../subagent-lifecycle.js";

// ==================== 子代理生成器 ====================
export {
  spawnSubagent as createSubagent,
  validateSpawnOptions,
} from "./subagent-spawn.js";
export type {
  SpawnOptions,
  SpawnContext,
  SpawnResult,
  SpawnSubagentMode,
  SpawnSubagentSandboxMode,
  SpawnSubagentContextMode,
} from "./subagent-spawn.types.js";
export {
  SpawnOptionsSchema,
  SpawnContextSchema,
  SpawnResultSchema,
} from "./subagent-spawn.types.js";

// ==================== 子代理生成增强 ====================
export type {
  Attachment,
  ProcessedAttachment,
  AttachmentsResult,
} from "./subagent-spawn.attachments.js";
export {
  processAttachments,
  cleanupAttachments,
  validateAttachments,
} from "./subagent-spawn.attachments.js";

export type {
  ContextInheritanceResult,
  ContextTransferOptions,
} from "./subagent-spawn.context.js";
export {
  resolveSpawnContext,
  buildSpawnContext,
  mergeContexts,
} from "./subagent-spawn.context.js";

export type {
  ModeSessionOptions,
} from "./subagent-spawn.mode-session.js";
export {
  spawnModeSessionSubagent,
  isSessionModeAvailable,
} from "./subagent-spawn.mode-session.js";

export type {
  ModelSessionOptions,
} from "./subagent-spawn.model-session.js";
export {
  spawnModelSessionSubagent,
  resolveModel,
  validateModelConfiguration,
} from "./subagent-spawn.model-session.js";

export type {
  OwnershipInfo,
  OwnershipValidationResult,
} from "./subagent-spawn.ownership.js";
export {
  resolveOwnership,
  validateOwnership,
  checkOwnerPermissions,
} from "./subagent-spawn.ownership.js";

export type {
  RuntimeSpawnOptions,
} from "./subagent-spawn.runtime.js";
export {
  spawnRuntimeSubagent,
  isSpawnAllowed,
  calculateSpawnLimitRemaining,
} from "./subagent-spawn.runtime.js";

export type {
  ThreadBindingOptions,
} from "./subagent-spawn.thread-binding.js";
export {
  spawnThreadBoundSubagent,
  validateThreadBinding,
} from "./subagent-spawn.thread-binding.js";

export type {
  WorkspaceInfo,
  WorkspaceOptions,
} from "./subagent-spawn.workspace.js";
export {
  resolveWorkspace,
  cleanupWorkspace,
  prepareWorkspace,
  validateWorkspace,
} from "./subagent-spawn.workspace.js";

// ==================== 子代理持久化存储 ====================
export {
  insertSubagentInstance,
  updateSubagentInstance,
  deleteSubagentInstance,
  getSubagentInstance as getSubagentInstanceFromStore,
  getSubagentInstanceBySessionKey,
  listSubagentInstances,
  countSubagentInstances,
  cleanupOldSubagentInstances,
  clearSubagentStore,
  isSubagentStoreInitialized,
} from "./subagent-registry.store.js";

// ==================== 子代理内存状态 ====================
export {
  getActiveSubagent,
  setActiveSubagent,
  addActiveSubagent,
  removeActiveSubagent,
  listActiveSubagents,
  getSubagentState,
  listAllSubagentStates,
  invalidatePersistedCache,
  onSubagentStateChange,
  onAnySubagentStateChange,
  updateSubagentStatus,
  getActiveSubagentCount,
  getRunningSubagentCount,
  clearActiveSubagents,
  getSubagentStateStats,
} from "./subagent-registry.state.js";

// ==================== 子代理注册表增强 ====================
export type {
  ArchiveOptions,
  ArchiveResult,
  RestoreResult,
} from "./subagent-registry.archive.js";
export {
  archiveSubagents,
  archiveSubagent,
  restoreSubagent,
  purgeArchivedSubagents,
  listArchivedSubagents,
  countArchivedSubagents,
} from "./subagent-registry.archive.js";

export {
  generateInstanceId,
  generateSessionKey,
  parseSessionKey,
  isValidStatusTransition,
  isTerminalStatus,
  isActiveStatus,
  calculateDuration,
  getInstanceAge,
  getLastActivityTime,
} from "./subagent-registry.helpers.js";

export type {
  QueryOptions,
  QueryFilter,
  QueryResult,
} from "./subagent-registry.queries.js";
export {
  querySubagents,
  getSubagentTree,
  getSubagentAncestry,
  findOrphanSubagents,
  getSubagentStats,
  findStuckSubagents,
} from "./subagent-registry.queries.js";

export type {
  ReadOptions,
} from "./subagent-registry.read.js";
export {
  readSubagent,
  readSubagentBySessionKey,
  readAllSubagents,
} from "./subagent-registry.read.js";

export type {
  RunTransitionResult,
  StartOptions,
  CompleteOptions,
  FailOptions,
} from "./subagent-registry.run-manager.js";
export {
  startSubagent,
  pauseSubagent as pauseSubagentByRunManager,
  resumeSubagent as resumeSubagentByRunManager,
  completeSubagent,
  failSubagent,
  cancelSubagent as cancelSubagentByRunManager,
} from "./subagent-registry.run-manager.js";

export type {
  PersistenceOptions,
  PersistenceStats,
} from "./subagent-registry.persistence.js";
export {
  persistSubagent,
  loadSubagentFromStore,
  syncStoreWithActive,
  persistActiveSubagents,
} from "./subagent-registry.persistence.js";

export type {
  SubagentStoreRecord,
} from "./subagent-registry.store.sqlite.js";
export {
  initSubagentStore,
  getSubagentStoreDb,
  getSubagentStoreStats,
} from "./subagent-registry.store.sqlite.js";

// ==================== 子代理公告系统 ====================
export type {
  AnnounceEventType,
  SubagentAnnouncement,
  AnnouncementBatcherOptions,
} from "./subagent-announce.js";
export {
  createSpawnAnnouncement,
  createStartAnnouncement,
  createProgressAnnouncement,
  createCompletionAnnouncement,
  createFailureAnnouncement,
  createCancellationAnnouncement,
  createPauseAnnouncement,
  createResumeAnnouncement,
  formatAnnouncement as formatSubagentAnnouncement,
  createAnnouncementFromStatusChange,
  getAnnouncementEventTypeLabel,
  shouldBroadcastAnnouncement,
  getAnnouncementImportance,
  AnnouncementBatcher,
} from "./subagent-announce.js";

// ==================== 子代理公告交付 ====================
export type {
  DeliveryTarget,
} from "./subagent-announce-delivery.js";
export {
  AnnouncementDelivery,
  createAnnouncementDelivery,
  getEventDeliveryPriority,
  shouldSuppressAnnouncement,
} from "./subagent-announce-delivery.js";

// ==================== 子代理公告系统增强 ====================
export type {
  DeliveryMode,
  DeliveryOptions,
  DeliveryResult,
  DeliveryTarget as AnnounceDeliveryTarget,
} from "./subagent-announce.delivery.js";
export {
  deliverAnnouncement,
  broadcastAnnouncement,
  getDeliveryStats,
} from "./subagent-announce.delivery.js";

export type {
  DispatchStrategy,
  DispatchOptions,
  DispatchResult,
} from "./subagent-announce.dispatch.js";
export {
  dispatchAnnouncement,
  subscribeToTopic,
  unsubscribeFromTopic,
  getSubscribedTopics,
} from "./subagent-announce.dispatch.js";

export type {
  AnnouncementFormat,
  FormatOptions,
  FormattedAnnouncement,
  AnnouncementMetadata,
} from "./subagent-announce.format.js";
export {
  formatAnnouncement,
  parseAnnouncement,
  validateAnnouncement,
} from "./subagent-announce.format.js";

export type {
  OriginType,
  OriginInfo,
  OriginChain,
} from "./subagent-announce.origin.js";
export {
  trackOrigin,
  getOrigin,
  isOriginTrusted,
  validateOriginChain,
  clearOrigin,
  getOriginStats,
} from "./subagent-announce.origin.js";

export type {
  OutputDestination,
  OutputOptions,
  OutputResult,
} from "./subagent-announce.output.js";
export {
  outputAnnouncement,
  registerOutputHandler,
  unregisterOutputHandler,
  getRegisteredDestinations,
  getOutputStats,
} from "./subagent-announce.output.js";

export type {
  AnnounceTimeoutOptions,
  AnnounceTimeout,
} from "./subagent-announce.timeout.js";
export {
  scheduleAnnounceTimeout,
  resolveAnnounceTimeout,
  cancelAnnounceTimeout,
  getAnnounceTimeout,
  getRemainingTime,
  isAnnounceTimedOut,
  clearAllTimeouts,
} from "./subagent-announce.timeout.js";

// ==================== 子代理能力声明 ====================
export type {
  SubagentCapability,
  CapabilityMatchResult,
  CapabilityQuery,
  ResolvedSubagentCapabilities,
  ResolveCapabilitiesOptions,
} from "./subagent-capabilities.js";
export {
  SubagentCapabilitySchema,
  registerCapability,
  unregisterCapability,
  getCapability,
  hasCapability,
  listCapabilities,
  matchCapabilities,
  findBestCapability,
  getCapabilityTags,
  getCapabilityCategories,
  getCapabilityStats,
  clearCapabilities,
  validateCapability,
  mergeCapabilities,
  standardCapabilities,
  registerStandardCapabilities,
  resolveSubagentCapabilities,
} from "./subagent-capabilities.js";

// ==================== 子代理控制接口 ====================
export type {
  ControlAction,
  ControlResult,
  ControlHandler,
  SubagentControlState,
} from "./subagent-control.js";
export {
  setSubagentControlHandler,
  getSubagentControlHandler,
  pauseSubagent,
  resumeSubagent,
  cancelSubagent as cancelSubagentById,
  restartSubagent,
  canPauseSubagent,
  canResumeSubagent,
  canCancelSubagent,
  canRestartSubagent,
  pauseAllSubagents,
  resumeAllSubagents,
  cancelAllSubagents,
  watchSubagentStatus,
  getSubagentControlState,
} from "./subagent-control.js";

// ==================== 子代理活跃上下文 ====================
export type {
  ContextTransferMode,
  ContextScope,
  SubagentContextData,
  SubagentContextSnapshot,
  ContextInheritanceOptions,
} from "./subagent-active-context.js";
export {
  initSubagentContext,
  setContextValue,
  getContextValue,
  hasContextValue,
  deleteContextValue,
  clearSubagentContext,
  getContextKeys,
  getAllContextValues,
  getContextSnapshot,
  transferContext,
  inheritContextFromParent,
  getParentContext,
  setParentContext,
  getContextHierarchy,
  getContextDepth,
  resolveContextValue,
  getContextStats,
  cleanupExpiredContexts,
  buildInheritedContext,
  initializeSubagentWithContext,
} from "./subagent-active-context.js";

// ==================== 子代理会话清理 ====================
export type {
  CleanupPolicy,
  CleanupStats,
} from "./subagent-session-cleanup.js";
export {
  setCleanupPolicy,
  getCleanupPolicy,
  startCleanupScheduler,
  stopCleanupScheduler,
  runCleanup,
  cleanupCompletedSubagents,
  cleanupFailedSubagents,
  cleanupCancelledSubagents,
  cleanupSubagent,
  cleanupAllSubagents,
  enforceMaxActiveLimit,
  enforcePerParentLimit,
  getCleanupStats,
  resetCleanupPolicy,
} from "./subagent-session-cleanup.js";

// ==================== 子代理运行时管理 ====================
export type {
  LivenessCheckOptions,
  LivenessResult,
  LivenessStats,
} from "./subagent-run-liveness.js";
export {
  checkLiveness,
  checkAllLiveness,
  getLivenessStats,
  markInstanceAlive,
  markInstanceDead,
  startLivenessMonitor,
  stopLivenessMonitor,
  isLivenessMonitorRunning,
} from "./subagent-run-liveness.js";

export type {
  TimeoutOptions,
  TimeoutResult,
  TimeoutStats,
} from "./subagent-run-timeout.js";
export {
  checkTimeout,
  checkAllTimeouts,
  getTimeoutStats,
  scheduleTimeout,
  cancelScheduledTimeout,
  handleTimeout,
  scheduleInstanceTimeout,
  clearAllTimeouts as clearAllRunTimeouts,
  getScheduledTimeoutCount,
} from "./subagent-run-timeout.js";

export type {
  SessionMetrics,
  AggregatedMetrics,
} from "./subagent-session-metrics.js";
export {
  collectSessionMetrics,
  collectAllSessionMetrics,
  aggregateSessionMetrics,
  getPerformanceMetrics,
  logSessionMetrics,
} from "./subagent-session-metrics.js";

export type {
  ReconciliationResult,
  ReconciliationOptions,
} from "./subagent-session-reconciliation.js";
export {
  reconcileSessions,
  detectConflicts,
  resolveConflict,
  resolveAllConflicts,
} from "./subagent-session-reconciliation.js";

export type {
  OrphanRecoveryResult,
  OrphanRecoveryOptions,
} from "./subagent-orphan-recovery.js";
export {
  detectOrphans,
  isOrphan,
  recoverOrphans,
  getOrphanStats,
} from "./subagent-orphan-recovery.js";

export type {
  RecoveryState,
  RecoveryInfo,
  RecoveryOptions,
} from "./subagent-recovery-state.js";
export {
  getRecoveryState,
  setRecoveryState,
  clearRecoveryState,
  attemptRecovery,
  getRecoveryStats,
  clearAllRecoveryStates,
} from "./subagent-recovery-state.js";

export type {
  TargetPolicyType,
  TargetPolicy,
  TargetNode,
} from "./subagent-target-policy.js";
export {
  registerTargetNode,
  unregisterTargetNode,
  listTargetNodes,
  getTargetNode,
  selectTarget,
  updateNodeLoad,
  incrementNodeLoad,
  getTargetStats,
} from "./subagent-target-policy.js";

export type {
  TaskNameOptions,
} from "./subagent-task-name.js";
export {
  generateTaskName,
  sanitizeTaskName,
  parseTaskName,
  generateUniqueTaskName,
} from "./subagent-task-name.js";

export type {
  YieldType,
  YieldOutput,
  YieldOptions,
} from "./subagent-yield-output.js";
export {
  yieldOutput,
  getYieldOutputs,
  getLastYieldOutput,
  clearYieldOutputs,
  completeWithYield,
  failWithYield,
  getYieldStats,
  clearAllYieldOutputs,
} from "./subagent-yield-output.js";

// ==================== 子代理调度器 ====================
export type {
  SubagentTaskStatus,
  SubagentTask,
  SubagentScheduledResult,
  ScheduleOptions,
} from "./subagentScheduler.js";
export {
  SubagentScheduler,
  getSubagentScheduler,
  resetSubagentSchedulerForTests,
} from "./subagentScheduler.js";

// ==================== 子代理编排器 ====================
export type {
  OrchestrationStrategy,
  OrchestratorTask,
  SubagentResult,
  OrchestrateOptions,
} from "./subagentOrchestrator.js";
export {
  SubagentOrchestrator,
  orchestrateSubagents,
} from "./subagentOrchestrator.js";

// ==================== 子代理遥测 ====================
export type {
  SubagentStep,
  SubagentStats,
  SubagentAggregate,
} from "./subagentTelemetry.js";
export {
  SubagentTelemetry,
  getSubagentTelemetry,
  resetSubagentTelemetryForTests,
} from "./subagentTelemetry.js";
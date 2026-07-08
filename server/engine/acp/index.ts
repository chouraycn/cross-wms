/**
 * ACP Control Plane — 下一代 Agent 执行引擎
 *
 * ⚠️  实验性：当前主流量对话仍通过 chatService + /api/agent-chat 提供
 *
 * 架构定位：
 * - 参照 openclaw ACP 协议设计的统一 Agent 运行时
 * - 支持多运行时（embedded runtime、子代理、工具执行器等）
 * - SessionActorQueue 保证同会话串行执行
 * - turnRunner 管理 attempt 生命周期与失败回退
 *
 * 与现有框架的关系：
 * - chatService（旧）→ /api/chat（兼容层）
 * - agentChat（当前主入口）→ /api/agent-chat → 调用 chatService
 * - ACP（未来）→ 直接接管会话管理与回合执行
 *
 * 迁移路线：agentChat → 逐步替换底层为 ACP → 最终 chatService 退休
 */

// Types
export * from "./types.js";
export type { AcpSessionCreateRequest, AcpSessionCloseRequest, AcpTurnRequest } from "./acpTypes.js";

// ACP Server
export {
  getAcpServer,
  startAcpServer,
  stopAcpServer,
  handleAcpRequest,
  resetAcpServerForTests,
} from "./acpServer.js";
export type {
  AcpServer,
  AcpRequestEnvelope,
  AcpResponseEnvelope,
  AcpSession,
  AcpTurn,
  AcpServerContext,
} from "./acpServer.js";

// Core Components
export { AcpSessionManager } from "./sessionManager.js";
export type { AcpSessionManager as IAcpSessionManager } from "./sessionManager.js";
export { SessionActorQueue } from "./sessionActorQueue.js";
export { RuntimeCache, RuntimeHandleCache } from "./runtimeCache.js";
export {
  markAcpTurnActive,
  clearAcpTurnActive,
  isAcpTurnActive,
  getAcpTurnActive,
  getActiveTurnSessionKeys,
  getActiveTurnCount,
  resetActiveTurnsForTests,
} from "./activeTurns.js";
export { runManagerTurn } from "./turnRunner.js";

// Turn Stream
export {
  consumeTurnEvents,
  createEventGate,
  closeEventGate,
  waitForQueuedEvents,
  mergeTurnStreams,
  createTurnStreamBuffer,
  applyEventToBuffer,
  getBufferedMainText,
  getBufferedThinkingText,
  StreamRateLimiter,
} from "./turnStream.js";
export type {
  TurnEventGate,
  TurnStreamOutcome,
  TurnStreamBuffer,
} from "./turnStream.js";

// Background Task
export {
  BackgroundTaskManager,
  getBackgroundTaskManager,
  resetBackgroundTaskManagerForTests,
} from "./backgroundTask.js";
export type {
  BackgroundTask,
  BackgroundTaskStatus,
  CreateBackgroundTaskParams,
} from "./backgroundTask.js";

// Identity Reconcile
export {
  reconcileRuntimeSessionIdentities,
  startupIdentityReconcile,
  buildRuntimeSessionName,
  verifySessionIdentity,
  generateSessionIdentityFingerprint,
  isSameSessionIdentity,
} from "./identityReconcile.js";

// Resume State
export {
  ResumeStateStore,
  getResumeStateStore,
  resetResumeStateStoreForTests,
  shouldResumeFromCrash,
  resumeFromCrash,
  markSessionSafelyClosed,
  recoverCrashSessions,
} from "./resumeState.js";
export type {
  ResumeState,
  SaveResumeStateParams,
} from "./resumeState.js";

// Turn Results
export {
  createTurnResultAccumulator,
  applyEventToAccumulator,
  finalizeTurnResult,
  processTurnEvents,
  normalizeTurnResult,
  validateTurnResult,
  summarizeTurnResult,
  turnResultToStorable,
  turnResultFromStored,
} from "./turnResults.js";
export type {
  ProcessedTurnResult,
  TurnResultAccumulator,
} from "./turnResults.js";

// Runtime Options
export {
  normalizeRuntimeOptions,
  validateRuntimeOptionPatch,
  mergeRuntimeOptions,
  buildRuntimeControlSignature,
  runtimeOptionsEqual,
  validateRuntimeModeInput,
  validateRuntimeModelInput,
  validateRuntimeThinkingInput,
  validateRuntimePermissionProfileInput,
  validateRuntimeCwdInput,
} from "./runtimeOptions.js";

// Runtime Registry
export { getAcpRuntimeBackend, requireAcpRuntimeBackend } from "./runtimeRegistry.js";
export type { AcpRuntimeBackend } from "./runtimeRegistry.js";

// Security & Policy
export { PolicyEngine, policyEngine } from "./policy.js";
export type { PolicyRule, PolicyCondition, PolicyEvaluationResult, PermissionLevel, PolicyScope, PolicyCategory, PermissionProfile, ToolPermission, AcpConfigPolicy, AcpDispatchPolicyState } from "./policy.js";
export { isAcpEnabledByPolicy, resolveAcpDispatchPolicyMessage, resolveAcpAgentPolicyError } from "./policy.js";
export { PermissionRelay, permissionRelay } from "./permissionRelay.js";
export type { ApprovalRequest, ApprovalStatus, ApprovalScope } from "./permissionRelay.js";
export { ApprovalClassifier, approvalClassifier } from "./approvalClassifier.js";
export type { RiskLevel, ApprovalCategory, RiskAssessment, RiskFactor, ApprovalClassification, AcpApprovalClass, AcpApprovalClassification } from "./approvalClassifier.js";
export { classifyAcpToolApproval } from "./approvalClassifier.js";

// Policy Conformance
export { buildPolicyConformanceReport } from "./policyConformance.js";
export type { PolicyConformanceFinding, PolicyConformanceReport } from "./policyConformance.js";
export { POLICY_CONFORMANCE_CHECK_IDS } from "./policyConformance.js";

// Tool Policy Conformance
export { POLICY_TOOL_GROUPS, getToolGroups, getToolsInGroup, getGroupsForTool, isToolInGroup, validateToolGroupId } from "./toolPolicyConformance.js";
export type { ToolGroupId } from "./toolPolicyConformance.js";

// Process Lease
export {
  createAcpxProcessLeaseStore,
  createAcpxProcessLeaseId,
  hashAcpxProcessCommand,
  withAcpxLeaseEnvironment,
  normalizeAcpxProcessLease,
  normalizeAcpxProcessLeaseFile,
} from "./processLease.js";
export type { AcpxProcessLease, AcpxProcessLeaseState, AcpxProcessLeaseStore, AcpxProcessLeaseFile } from "./processLease.js";
export { OPENCLAW_ACPX_LEASE_ID_ENV, OPENCLAW_GATEWAY_INSTANCE_ID_ENV, OPENCLAW_ACPX_LEASE_ID_ARG, OPENCLAW_GATEWAY_INSTANCE_ID_ARG } from "./processLease.js";

// Process Reaper
export {
  isOpenClawLeaseAwareAcpxProcessCommand,
  isOpenClawOwnedAcpxProcessCommand,
  listPlatformProcesses,
  cleanupOpenClawOwnedAcpxProcessTree,
  reapStaleOpenClawOwnedAcpxOrphans,
} from "./processReaper.js";
export type { AcpxProcessInfo, AcpxProcessCleanupDeps, AcpxProcessCleanupResult, AcpxStartupReapResult } from "./processReaper.js";

// Codex Auth Bridge
export {
  writeCodexAcpWrapper,
  writeClaudeAcpWrapper,
  prepareAcpxCodexAuthConfig,
} from "./codexAuthBridge.js";

// Config Schema
export { DEFAULT_ACPX_TIMEOUT_SECONDS, DEFAULT_ACPX_PERMISSION_MODE, parseAcpxPermissionMode } from "./configSchema.js";
export type { AcpxPermissionMode, ResolvedAcpxPluginConfig, RawAcpxPluginConfig } from "./configSchema.js";

// Config
export { resolveAcpxPluginConfig, toAcpMcpServers } from "./config.js";

// Command Line
export { splitCommandParts, quoteShellArg, joinCommandParts } from "./commandLine.js";

// Runtime API
export {
  AcpRuntimeError,
  registerAcpRuntimeBackend,
  unregisterAcpRuntimeBackend,
  getRegisteredAcpRuntimeBackends,
} from "./runtimeApi.js";
export type {
  AcpRuntimeErrorCode,
  AcpRuntimeHandle,
  AcpRuntimeStatus,
  AcpRuntimeEvent,
  AcpRuntimeTurnResult,
  AcpRuntimeTurn,
  AcpRuntime,
  OpenClawPluginService,
  OpenClawPluginServiceContext,
  PluginLogger,
} from "./runtimeApi.js";

// Runtime Proxy
export { createLazyAcpRuntimeProxy } from "./runtimeProxy.js";

// State
export {
  ACPX_PROCESS_LEASE_NAMESPACE,
  ACPX_PROCESS_LEASE_MAX_ENTRIES,
  ACPX_LEGACY_PROCESS_LEASE_FILE,
  ACPX_GATEWAY_INSTANCE_NAMESPACE,
  ACPX_GATEWAY_INSTANCE_KEY,
  ACPX_GATEWAY_INSTANCE_MAX_ENTRIES,
  ACPX_LEGACY_GATEWAY_INSTANCE_FILE,
  normalizeAcpxGatewayInstanceRecord,
} from "./state.js";
export type { AcpxGatewayInstanceRecord } from "./state.js";

// Service
export { createAcpxRuntimeService, resolveAcpxTimerTimeoutMs } from "./service.js";

// Doctor Diagnostics
export { runDoctorChecks, checkCorePolicy, checkToolPolicy, checkExecApprovals } from "./doctor.js";
export type { HealthFinding, DoctorCheckScope, DoctorCheckResult, DoctorReport } from "./doctor.js";

// Protocol Translation
export { AcpTranslator, acpTranslator } from "./translator.js";
export type { OpenAiChatCompletionRequest, OpenAiChatCompletionResponse, OpenAiChatMessage } from "./translator.js";

// Session Mapping
export { SessionMapper, sessionMapper } from "./sessionMapper.js";
export type { SessionBinding, SessionContext, AcpSessionMeta, AcpServerOptions } from "./sessionMapper.js";
export { parseSessionMeta, resolveSessionKey, resetSessionIfNeeded } from "./sessionMapper.js";

// Persistent Bindings
export { PersistentBindings, getPersistentBindings } from "./persistentBindings.js";
export type { PersistentBindingsConfig, ConfiguredAcpBindingSpec, SessionBindingRecord, ResolvedConfiguredAcpBinding } from "./persistentBindings.js";
export { buildConfiguredAcpSessionKey, toConfiguredAcpBindingRecord, parseConfiguredAcpSessionKey, resolveConfiguredAcpBindingSpecFromRecord, toResolvedConfiguredAcpBinding } from "./persistentBindings.js";

// Persistent Bindings - Types
export type {
  AcpRuntimeSessionMode,
  SessionAcpMeta,
  AcpBindingConfigShape,
  BindingResolutionResult,
  BindingLifecycleResult,
  BindingResolveResult,
} from "./persistentBindingsTypes.js";

// Persistent Bindings - Resolve
export {
  normalizeText,
  normalizeLowercaseStringOrEmpty,
  normalizeOptionalLowercaseString,
  normalizeAccountId,
  sanitizeAgentId,
  normalizeMode,
  normalizeBindingConfig,
  resolveConfiguredAcpBinding,
  isConfiguredAcpSessionKey,
} from "./persistentBindingsResolve.js";

// Persistent Bindings - Lifecycle
export {
  ensureConfiguredAcpBindingSession,
  ensureConfiguredAcpBindingSessions,
  syncConfiguredAcpBindingSession,
  removeConfiguredAcpBindingSession,
} from "./persistentBindingsLifecycle.js";
export type { AcpSessionManagerLike, BindingLifecycleConfig } from "./persistentBindingsLifecycle.js";

// Translator - Session Updates
export {
  toSessionUpdate,
  sessionUpdateToOpenAiDelta,
  SessionLineageManager,
  getSessionLineageManager,
  resetSessionLineageManager,
} from "./translatorSessionUpdates.js";
export type {
  OpenAiDelta,
  SessionUpdateEvent,
  SessionUpdateOptions,
  SessionLineage,
} from "./translatorSessionUpdates.js";

// Translator - Rate Limit
export {
  RateLimiter,
  getRateLimiter,
  resetRateLimiter,
  withRateLimit,
  getRateLimitKeyFromRequest,
} from "./translatorRateLimit.js";
export type { RateLimitConfig, RateLimitResult } from "./translatorRateLimit.js";

// Event Ledger
export { createInMemoryAcpEventLedger, eventLedger } from "./eventLedger.js";
export type { AcpEventLedger, AcpEventLedgerEntry, AcpEventLedgerReplay } from "./eventLedger.js";

// Secret File
export { readSecretFromFile, readOptionalSecretFromFile, readEnvSecret } from "./secretFile.js";

// Commands
export { getAvailableCommands, getCommandByName, hasCommand } from "./commands.js";
export type { AvailableCommand } from "./commands.js";

// Permission Resolver
export { resolvePermissionRequest } from "./permissionResolver.js";
export type { RequestPermissionRequest, RequestPermissionResponse, PermissionOption } from "./permissionResolver.js";

// Client
export { AcpClient, runAcpClientInteractive } from "./client.js";
export type { AcpClientOptions, AcpClientHandle } from "./client.js";

// Event Mapper
export {
  extractTextFromPrompt,
  extractAttachmentsFromPrompt,
  formatToolTitle,
  inferToolKind,
  extractToolCallContent,
  extractToolCallLocations,
} from "./eventMapper.js";

// Conversation ID
export { normalizeConversationText } from "./conversationId.js";

// Translator Extensions
export { extractReplayChunks } from "./translatorReplay.js";
export type { GatewayTranscriptMessage, GatewayChatContentBlock, ReplayChunk } from "./translatorReplay.js";
export {
  encodeListSessionsCursor,
  decodeListSessionsCursor,
  assertAbsoluteCwd,
  resolveListSessionsPageSize,
} from "./translatorSessionList.js";
export type { ListSessionsCursor } from "./translatorSessionList.js";
export {
  normalizeClientCapabilities,
  buildSessionPresentation,
  buildSessionMetadata,
  buildSessionUsageSnapshot,
} from "./translatorPresentation.js";
export type {
  ClientCapabilityState,
  SessionConfigOption,
  SessionModeState,
  SessionSnapshot,
  GatewaySessionPresentationRow,
} from "./translatorPresentation.js";

// Runtime
export { isAcpRuntimeSpawnAvailable } from "./runtimeAvailability.js";
export { AcpRuntimeError, AcpSessionError, AcpBackendError } from "./runtimeErrors.js";
export {
  readAcpSessionMeta,
  writeAcpSessionMeta,
  deleteAcpSessionMeta,
  listAcpSessionEntries,
  upsertAcpSessionMeta,
} from "./runtimeSessionMeta.js";
export type {
  SessionAcpIdentity,
  AcpSessionRuntimeOptions,
  SessionAcpMeta,
  AcpSessionStoreEntry,
} from "./runtimeSessionMeta.js";

// Singleton accessor
import { AcpSessionManager } from "./sessionManager.js";

let ACP_SESSION_MANAGER_SINGLETON: AcpSessionManager | null = null;

export interface AcpSessionManagerDeps {
  readSessionEntry(params: {
    cfg: unknown;
    sessionKey: string;
    clone: boolean;
  }): { acp?: import("./types.js").SessionAcpMeta } | null;
  upsertSessionMeta(params: {
    cfg: unknown;
    sessionKey: string;
    mutate: (
      current: import("./types.js").SessionAcpMeta | undefined,
      entry: { acp?: import("./types.js").SessionAcpMeta } | undefined,
    ) => import("./types.js").SessionAcpMeta | null | undefined;
    skipMaintenance?: boolean;
    takeCacheOwnership?: boolean;
  }): Promise<{ acp?: import("./types.js").SessionAcpMeta } | null>;
  createRuntime(options: { backend: string; meta: import("./types.js").SessionAcpMeta }): Promise<import("./types.js").AcpRuntime>;
}

export function getAcpSessionManager(deps?: AcpSessionManagerDeps): AcpSessionManager {
  if (!ACP_SESSION_MANAGER_SINGLETON && deps) {
    ACP_SESSION_MANAGER_SINGLETON = new AcpSessionManager(deps);
  }
  if (!ACP_SESSION_MANAGER_SINGLETON) {
    throw new Error("ACP session manager not initialized. Provide deps on first call.");
  }
  return ACP_SESSION_MANAGER_SINGLETON;
}

export function initializeAcpSessionManager(deps: AcpSessionManagerDeps): AcpSessionManager {
  const manager = new AcpSessionManager(deps);
  ACP_SESSION_MANAGER_SINGLETON = manager;
  return manager;
}

export function resetAcpSessionManagerForTests(): void {
  ACP_SESSION_MANAGER_SINGLETON = null;
}

export const acpTesting = {
  resetAcpSessionManagerForTests,
  setAcpSessionManagerForTests(manager: import("./sessionManager.js").AcpSessionManager | null) {
    ACP_SESSION_MANAGER_SINGLETON = manager;
  },
};

export { startGatewayServer, stopGatewayServer } from './server.js';
export type { GatewayServer, GatewayServerOptions } from './server.js';

// Gateway method registry — 移植自 openclaw/src/gateway/methods/registry.ts
export {
  createGatewayMethodRegistry,
  createGatewayMethodDescriptorsFromHandlers,
  createPluginGatewayMethodDescriptor,
  createPluginGatewayMethodDescriptors,
} from './methods/registry.js';
export type { GatewayMethodRegistry } from './methods/registry.js';
export { authorizeGatewayConnect, authorizeHttpGatewayConnect, authorizeWsControlUiGatewayConnect } from './auth.js';
export type { GatewayAuthResult, GatewayAuthSurface, AuthorizeGatewayConnectParams } from './auth.js';
export { runBootOnce } from './boot.js';
export type { BootResult } from './boot.js';
export { callGateway, callGatewayWithScopes, callGatewayCli } from './call.js';
export type { CallGatewayOptions, GatewayTransportError } from './call.js';
export { GatewayClient } from './client.js';
export type { GatewayClientRequestOptions, GatewayClientCloseInfo } from './client.js';
export { GATEWAY_EVENT_UPDATE_AVAILABLE } from './events.js';
export type { UpdateAvailableEventData, GatewayUpdateAvailableEventPayload } from './events.js';
export { resolveGatewayBindHost, resolveGatewayListenHosts, resolveClientIp, isSecureWebSocketUrl } from './net.js';
export { probeGateway } from './probe.js';
export type { GatewayProbeResult, GatewayProbeCapability } from './probe.js';
export { logWs, shouldLogWs, formatForLog } from './ws-log.js';

// Session utilities
export {
  resolveTranscriptPathForComparison,
} from './session-transcript-path.js';
export {
  normalizeOptionalString as normalizeTranscriptJsonString,
  extractJsonStringFieldPrefix,
  extractJsonNullableStringFieldPrefix,
  extractJsonNumberFieldPrefix,
} from './session-transcript-json.js';
export {
  clearSessionTranscriptKeyCacheForTests,
  resolveSessionKeyForTranscriptFile,
} from './session-transcript-key.js';
export {
  readTranscriptLines,
  getTranscriptPreview,
  countTranscriptLines,
} from './session-transcript-readers.js';
export type { TranscriptLine } from './session-transcript-readers.js';
export {
  archiveSession,
  listArchivedSessions,
} from './session-archive.js';
export {
  registerSessionResetHandler,
  unregisterSessionResetHandler,
  validateSessionResetOptions,
  resetSession,
} from './session-reset-service.js';
export type { SessionResetOptions, SessionResetResult } from './session-reset-service.js';
export {
  deriveGatewaySessionLifecycleSnapshot,
  isStaleLifecycleEventForSession,
} from './session-lifecycle-state.js';
export type { GatewaySessionLifecycleSnapshot } from './session-lifecycle-state.js';
export {
  hasInternalHookListeners,
  registerSessionPatchHookListener,
  unregisterSessionPatchHookListener,
  triggerSessionPatchHook,
} from './session-patch-hooks.js';
export type { SessionPatchHookContext, SessionPatchHookEvent } from './session-patch-hooks.js';
export type { SessionCompactionCheckpoint, CreateCheckpointOptions } from './session-compaction-checkpoints.js';
export {
  createCompactionCheckpoint,
  getCompactionCheckpoints,
  getLatestCompactionCheckpoint,
  clearCompactionCheckpoints,
  getCompactionCheckpointCount,
  shouldCompact,
} from './session-compaction-checkpoints.js';
export {
  registerChildSession,
  getChildSessions,
  getParentSessionKey,
  updateChildSessionStatus,
} from './session-child-sessions.js';
export {
  registerSessionsPatchHandler,
  unregisterSessionsPatchHandler,
  patchSession,
  validateSessionsPatchParams,
} from './sessions-patch.js';
export type { SessionsPatchParams, SessionsPatchResult } from './sessions-patch.js';
export {
  registerSessionResolveHandler,
  unregisterSessionResolveHandler,
  resolveSession,
  validateResolveOptions,
  resolveSessions,
} from './sessions-resolve.js';
export type { ResolveSessionOptions, ResolvedSession } from './sessions-resolve.js';
export {
  getSessionStore,
  getSessionEntry,
  setSessionEntry,
  deleteSessionEntry,
  hasSessionEntry,
  listSessionKeys,
  loadSessionEntry,
  buildGatewaySessionRow,
  listSessions,
  loadCombinedSessionStoreForGateway,
  resolveGatewaySessionStoreTarget,
  resolveSessionTranscriptCandidates,
  resolvePreferredSessionKeyForSessionIdMatches,
  clearSessionStoreForTests,
} from './session-utils.js';
export type { LoadSessionEntryResult, SessionStore } from './session-utils.js';
export type {
  SessionRunStatus,
  GatewaySessionRow,
  SessionPreviewItem,
  SessionsPreviewEntry,
  SessionsPreviewResult,
  GatewaySessionsDefaults,
  SessionsListResultBase,
  SessionsListResult,
  GatewayAgentRow,
} from './session-utils.types.js';

// Auth system
export type { TokenType, ResolvedToken } from './auth-token-resolution.js';
export {
  extractTokenFromHeaders,
  extractTokenFromQuery,
  hashToken,
  generateToken,
  validateTokenFormat,
  isTokenExpired,
} from './auth-token-resolution.js';
export type { AuthMode, AuthConfig, NormalizedAuthConfig } from './auth-config-utils.js';
export {
  normalizeAuthConfig,
  validateAuthConfig,
  getAuthMethodDescription,
  mergeAuthConfigs,
  authResultToHttpStatus,
} from './auth-config-utils.js';
export type { RateLimitEntry, RateLimitConfig } from './auth-rate-limit.js';
export {
  checkRateLimit,
  incrementRateLimit,
  resetRateLimit,
  clearAllRateLimits,
  getRateLimitStatus,
  startRateLimitCleanup,
  stopRateLimitCleanup,
} from './auth-rate-limit.js';
export type { AuthModePolicy, AuthPolicyEvaluation } from './auth-mode-policy.js';
export {
  registerAuthModePolicy,
  unregisterAuthModePolicy,
  getAuthModePolicy,
  listAuthModePolicies,
  evaluateAuthPolicy,
  getSupportedAuthModes,
  getRequiredAuthModes,
} from './auth-mode-policy.js';
export type { AuthSurfaceInfo } from './auth-surface-resolution.js';
export {
  registerAuthSurface,
  unregisterAuthSurface,
  resolveAuthSurface,
  getSurfaceInfo,
  listAuthSurfaces,
  requiresAuthForSurface,
  getScopesForSurface,
} from './auth-surface-resolution.js';
export type { StartupAuthResult, StartupAuthOptions } from './startup-auth.js';
export { getStartupAuthStatus } from './startup-auth.js';
export type { SharedAuthState, SharedAuthSessionBinding } from './shared-auth.js';
export {
  initializeSharedAuth,
  getSharedAuthToken,
  getSharedAuthTokenHash,
  validateSharedToken,
  rotateSharedToken,
  isSharedTokenExpired,
  getSharedAuthState,
  enableSharedAuth,
  disableSharedAuth,
  bindSessionToSharedAuth,
  unbindSessionFromSharedAuth,
  isSessionBoundToSharedAuth,
  cleanupExpiredSessionBindings,
  clearSharedAuthForTests,
} from './shared-auth.js';

// HTTP layer
export type { HttpMethod, HttpHeaders, HttpRequestLike, HttpResponseLike, HttpError } from './http-common.js';
export {
  normalizeHttpMethod,
  getHeaderValue,
  getHeaderValues,
  parseQueryString,
  getRequestPath,
  getRequestQuery,
  createHttpError,
  isHttpError,
  setCorsHeaders,
  sendJsonResponse,
  sendErrorResponse,
} from './http-common.js';
export type { EndpointHandler, EndpointDefinition } from './http-endpoint-helpers.js';
export {
  registerEndpoint,
  unregisterEndpoint,
  findMatchingEndpoint,
  listEndpoints,
  createJsonEndpoint,
  clearEndpointsForTests,
} from './http-endpoint-helpers.js';
export type { AuthorizeRequestOptions, AuthorizeRequestResult } from './http-utils-authorize-request.js';
export {
  authorizeRequest,
  createAuthMiddleware,
  extractClientIp,
} from './http-utils-authorize-request.js';
export type { ModelOverride, ModelOverrideSource } from './http-utils-model-override.js';
export {
  extractModelOverrideFromHeaders,
  extractModelOverrideFromQuery,
  extractModelOverrideFromBody,
  mergeModelOverrides,
  extractModelOverride,
  validateModelOverride,
  applyModelOverride,
} from './http-utils-model-override.js';
export type { HttpStage, HttpStageHandler, HttpStageContext } from './server-http-stages.js';
export {
  registerHttpStageHandler,
  unregisterHttpStageHandler,
  registerGlobalErrorHandler,
  unregisterGlobalErrorHandler,
  getStageHandlers,
  clearHttpStagesForTests,
} from './server-http-stages.js';
export type { RequestTraceEntry } from './server-http-request-trace.js';
export {
  recordRequestTrace,
  getRequestTraces,
  getRequestTraceStats,
  clearRequestTraces,
  addTraceFilter,
  removeTraceFilter,
  traceRequest,
} from './server-http-request-trace.js';

// Startup sequence
export type { EarlyStartupContext, EarlyStartupTask } from './server-startup-early.js';
export {
  registerEarlyStartupTask,
  unregisterEarlyStartupTask,
  getEarlyStartupTasks,
  createEarlyStartupContext,
  clearEarlyStartupTasks,
} from './server-startup-early.js';
export type { PostAttachContext, PostAttachTask } from './server-startup-post-attach.js';
export {
  registerPostAttachTask,
  unregisterPostAttachTask,
  getPostAttachTasks,
  createPostAttachContext,
  clearPostAttachTasks,
} from './server-startup-post-attach.js';
export type { StartupLogEntry, StartupLogSummary } from './server-startup-log.js';
export {
  logStartupEvent,
  startStartupLog,
  endStartupLog,
  getStartupLog,
  getStartupLogSummary,
  getStartupStageDuration,
  clearStartupLog,
  formatStartupLogSummary,
} from './server-startup-log.js';
export type { SessionMigration, MigrationResult } from './server-startup-session-migration.js';
export {
  registerSessionMigration,
  unregisterSessionMigration,
  getSessionMigrations,
  isMigrationApplied,
  markMigrationApplied,
  getPendingMigrations,
  clearSessionMigrations,
  getMigrationStatus,
} from './server-startup-session-migration.js';
export type { StartupTask, StartupTaskResult, StartupTaskSummary } from './startup-tasks.js';
export {
  registerStartupTask,
  unregisterStartupTask,
  getStartupTask,
  listStartupTasks,
  clearStartupTasks,
} from './startup-tasks.js';
export type { BootEchoState } from './boot-echo-guard.js';
export {
  initializeBootEcho,
  getBootId,
  getBootTime,
  getUptimeMs,
  recordEcho,
  isEchoAllowed,
  setEchoLimit,
  enableBootEcho,
  disableBootEcho,
  getEchoStats,
  clearEchoHistory,
  isBootComplete,
  getBootEchoState,
} from './boot-echo-guard.js';

// Runtime state
export {
  getRuntimeConfig,
  setRuntimeConfig,
  updateRuntimeConfig,
  getConfigValue,
  isFeatureEnabled,
  enableFeature,
  disableFeature,
  registerConfigListener,
  unregisterConfigListener,
  resetRuntimeConfig,
  getDefaultRuntimeConfig,
} from './server-runtime-config.js';
export type { RuntimeConfig } from './server-runtime-config.js';
export {
  registerService as registerRuntimeService,
  unregisterService as unregisterRuntimeService,
  getService as getRuntimeService,
  getServiceStatus as getRuntimeServiceStatus,
  listServices as listRuntimeServices,
  getServicesStatus as getRuntimeServicesStatus,
  clearServices as clearRuntimeServices,
} from './server-runtime-services.js';
export type { RuntimeService, RuntimeServiceStatus, ServiceRegistry } from './server-runtime-services.js';
export {
  getLiveState,
  setLiveStateStatus,
  startLiveState,
  stopLiveState,
  incrementConnections,
  decrementConnections,
  setActiveSessions,
  incrementRequests,
  incrementErrors,
  setLastError,
  updateMetrics,
  setFeatureState,
  registerLiveStateListener,
  unregisterLiveStateListener,
  resetLiveState,
} from './server-live-state.js';
export type { LiveState } from './server-live-state.js';
export type {
  GatewayBroadcastOpts,
  GatewayBroadcastFn,
  GatewayBroadcastToConnIdsFn,
} from './server-broadcast-types.js';
export {
  createGatewayRuntimeState,
  getGatewayRuntimeState,
  resetGatewayRuntimeState,
  getNextAgentRunSeq,
  setDedupeEntry,
  getDedupeEntry,
  deleteDedupeEntry,
  cleanupExpiredDedupe,
  registerChatAbortController,
  unregisterChatAbortController,
  abortChatSession,
  getChatRunBuffer,
  setChatRunBuffer,
  deleteChatRunBuffer,
} from './server-runtime-state.js';
export type {
  GatewayRuntimeState,
  DedupeEntry,
  ChatAbortControllerEntry,
} from './server-runtime-state.js';
export {
  formatBonjourInstanceName,
  resolveBonjourCliPath,
  setGatewayDiscoveryInfo,
  getGatewayDiscoveryInfo,
  clearGatewayDiscoveryInfo,
  getDiscoveryHosts,
  formatGatewayUrl,
  listGatewayUrls,
} from './server-runtime-discovery.js';
export type { GatewayDiscoveryInfo } from './server-runtime-discovery.js';

// Tools and plugins
export {
  resolveGatewayScopedTools,
  isToolAllowedInGateway,
  getGatewayToolNames,
  toolExistsInGateway,
} from './tool-resolution.js';
export type {
  GatewayScopedToolSurface,
  GatewayToolInfo,
  ResolveGatewayToolsParams,
} from './tool-resolution.js';
export {
  handleToolsInvokeHttpRequest,
  handleToolsListHttpRequest,
} from './tools-invoke-http.js';
export type { ToolsInvokeInput, ToolsInvokeResult } from './tools-invoke-http.js';
export {
  mergeActivationSectionsIntoRuntimeConfig,
  applyActivationConfig,
  getPluginActivationFromConfig,
  setPluginActivationInConfig,
  mergeChannelActivationSections,
  mergePluginActivationSections,
} from './plugin-activation-runtime-config.js';
export {
  listChannelPluginConfigTargetIds,
  pluginConfigTargetsChanged,
  addPluginReloadTarget,
  clearPluginReloadTargets,
  getPluginReloadTargets,
  hasPluginReloadTargets,
  shouldReloadPlugin,
  shouldReloadChannel,
  markAllPluginsForReload,
  markPluginForReload,
  markChannelForReload,
} from './plugin-channel-reload-targets.js';
export type { ChannelPluginReloadTarget, PluginReloadTarget } from './plugin-channel-reload-targets.js';
export {
  registerNodeInvokePolicy,
  unregisterNodeInvokePolicy,
  unregisterPluginNodeInvokePolicies,
  listNodeInvokePolicies,
  getNodeInvokePolicy,
  setNodeInvokePolicyEnabled,
  applyPluginNodeInvokePolicy,
  hasDangerousCommandPolicy,
  clearNodeInvokePolicies,
} from './node-invoke-plugin-policy.js';
export type {
  NodeInvokePolicyContext,
  NodeInvokePolicyResult,
  NodeInvokePolicyHandler,
  NodeInvokePolicyRegistration,
} from './node-invoke-plugin-policy.js';

// 移植自 openclaw/src/gateway —— 中低依赖文件（降级实现）
// Chat input sanitize
export { sanitizeChatSendMessageInput } from './chat-input-sanitize.js';

// Config diff
export { diffConfigPaths } from './config-diff.js';

// Model pricing
export { isGatewayModelPricingEnabled } from './model-pricing-config.js';
export {
  replaceGatewayModelPricingCache,
  clearGatewayModelPricingCacheState,
  recordGatewayModelPricingSourceFailure,
  clearGatewayModelPricingSourceFailure,
  clearGatewayModelPricingFailures,
  getGatewayModelPricingHealth,
  getCachedGatewayModelPricing,
  getGatewayModelPricingCacheMeta,
  getGatewayModelPricingCacheFingerprint,
  resetGatewayModelPricingCacheForTest,
  setGatewayModelPricingForTest,
} from './model-pricing-cache-state.js';
export type {
  CachedPricingTier,
  CachedModelPricing,
  GatewayModelPricingHealth,
} from './model-pricing-cache-state.js';

// Control plane
export { normalizeControlPlaneIdentityPart } from './control-plane-identity.js';
export {
  resolveControlPlaneActor,
  formatControlPlaneActor,
  summarizeChangedPaths,
} from './control-plane-audit.js';
export {
  consumeControlPlaneWriteBudget,
  pruneStaleControlPlaneBuckets,
} from './control-plane-rate-limit.js';

// Channel health
export {
  DEFAULT_CHANNEL_STALE_EVENT_THRESHOLD_MS,
  DEFAULT_CHANNEL_CONNECT_GRACE_MS,
  evaluateChannelHealth,
  resolveChannelRestartReason,
} from './channel-health-policy.js';
export type {
  ChannelHealthEvaluation,
  ChannelHealthPolicy,
} from './channel-health-policy.js';
export { startChannelHealthMonitor } from './channel-health-monitor.js';
export type {
  ChannelHealthMonitor,
  ChannelManager as ChannelHealthChannelManager,
  ChannelRuntimeStatus,
} from './channel-health-monitor.js';

// WS logging
export {
  setGatewayWsLogStyle,
  getGatewayWsLogStyle,
} from './ws-logging.js';
export type { GatewayWsLogStyle } from './ws-logging.js';

// Agent event assistant text
export {
  resolveAssistantStreamDeltaText,
  isReplaceableAssistantStreamEvent,
  resolveAssistantStreamSnapshotText,
} from './agent-event-assistant-text.js';
export type { AgentEventPayload } from './agent-event-assistant-text.js';

// Exec approval manager
export { ExecApprovalManager } from './exec-approval-manager.js';
export type {
  ExecApprovalDecision,
  ExecApprovalRequestPayload,
  ExecApprovalRecord,
  ExecApprovalIdLookupResult,
} from './exec-approval-manager.js';

// Node invoke sanitize
export { sanitizeNodeInvokeParamsForForwarding } from './node-invoke-sanitize.js';
export type { GatewayClient as NodeInvokeGatewayClient } from './node-invoke-sanitize.js';

// Node command policy
export {
  DEFAULT_DANGEROUS_NODE_COMMANDS,
  listDangerousPluginNodeCommands,
  isForegroundRestrictedPluginNodeCommand,
  resolveNodeCommandAllowlist,
  resolveNodePairingCommandAllowlist,
  normalizeDeclaredNodeCommands,
  isNodeCommandAllowed,
} from './node-command-policy.js';
export type { NodeSession } from './node-command-policy.js';

// Assistant identity
export {
  DEFAULT_ASSISTANT_IDENTITY,
  resolveAssistantIdentity,
} from './assistant-identity.js';
export type { AssistantIdentity } from './assistant-identity.js';

// Plugin node capability
export {
  PLUGIN_NODE_CAPABILITY_PATH_PREFIX,
  DEFAULT_PLUGIN_NODE_CAPABILITY_TTL_MS,
  indexPluginNodeCapabilitySurfaces,
  resolvePluginNodeCapabilityTtlMs,
  resolvePluginNodeCapabilityExpiresAtMs,
  mintPluginNodeCapabilityToken,
  buildPluginNodeCapabilityScopedHostUrl,
  replacePluginNodeCapabilityInScopedHostUrl,
  normalizePluginNodeCapabilityScopedUrl,
  setClientPluginNodeCapability,
  refreshClientPluginNodeCapability,
  hasAuthorizedPluginNodeCapability,
} from './plugin-node-capability.js';
export type {
  PluginNodeCapabilitySurface,
  PluginNodeCapabilityClient,
  NormalizedPluginNodeCapabilityUrl,
} from './plugin-node-capability.js';

// Client start readiness
export { startGatewayClientWhenEventLoopReady } from './client-start-readiness.js';
export type {
  GatewayClientStartable,
  GatewayClientStartReadinessOptions,
} from './client-start-readiness.js';

// Startup control UI origins
export { maybeSeedControlUiAllowedOriginsAtStartup } from './startup-control-ui-origins.js';
export type { GatewayNonLoopbackBindMode } from './startup-control-ui-origins.js';

// ============================================================================
// 降级 stub 导出 — 移植自 openclaw/src/gateway 剩余文件
// 仅导出无命名冲突的 stub 文件（所有导出符号唯一）。冲突文件见下方注释。
// stub 实现：函数抛出 "not implemented"，类型为 unknown，常量为 undefined。
// ============================================================================
export * from "./active-sessions-shutdown-tracker.js";
export * from "./agent-list.js";
export * from "./agent-prompt.js";
export * from "./auth-install-policy.js";
export * from "./auth-resolve.js";
export * from "./auth-token-source-conflict.js";
export * from "./chat-display-projection.js";
export * from "./chat-sanitize.js";
export * from "./cli-session-history.claude.js";
export * from "./cli-session-history.merge.js";
export * from "./cli-session-history.js";
export * from "./client-bootstrap.js";
export * from "./connection-auth.js";
export * from "./connection-details.js";
export * from "./control-ui-contract.js";
export * from "./control-ui-csp.js";
export * from "./control-ui-http-utils.js";
export * from "./control-ui-links.js";
export * from "./control-ui-routing.js";
export * from "./control-ui-shared.js";
export * from "./control-ui.js";
export * from "./credentials-secret-inputs.js";
export * from "./device-auth.js";
export * from "./device-metadata-normalization.js";
export * from "./embeddings-http.js";
export * from "./exec-approval-ios-push.js";
export * from "./gateway-cli-backend.live-helpers.js";
export * from "./gateway-cli-backend.live-probe-helpers.js";
export * from "./gateway-codex-harness.live-helpers.js";
export * from "./gateway-config-prompts.shared.js";
export * from "./hooks-mapping.js";
export * from "./hooks-policy.js";
export * from "./hosted-plugin-surface-url.js";
export * from "./live-agent-probes.js";
export * from "./live-chat-projector.js";
export * from "./local-request-context.js";
export * from "./managed-image-attachments.js";
export * from "./mcp-http.handlers.js";
export * from "./mcp-http.protocol.js";
export * from "./mcp-http.request.js";
export * from "./mcp-http.runtime.js";
export * from "./mcp-http.schema.js";
export * from "./models-http.js";
export * from "./node-catalog.js";
export * from "./node-connect-reconcile.js";
export * from "./node-invoke-system-run-approval-errors.js";
export * from "./node-invoke-system-run-approval-match.js";
export * from "./node-invoke-system-run-approval.js";
export * from "./node-pairing-auto-approve.js";
export * from "./node-pending-work.js";
export * from "./node-reapproval-coordinator.js";
export * from "./open-responses.schema.js";
export * from "./openai-http.js";
export * from "./openresponses-file-content.js";
export * from "./openresponses-shape.js";
export * from "./operator-approval-runtime-token.js";
export * from "./operator-approvals-client.js";
export * from "./resolve-configured-secret-input-string.js";
export * from "./runtime-plugin-config.js";
export * from "./server-broadcast.js";
export * from "./server-channel-runtime.types.js";
export * from "./server-chat.load-gateway-session-row.runtime.js";
export * from "./server-chat.persist-session-lifecycle.runtime.js";
export * from "./server-close.runtime.js";
export * from "./server-close.js";
export * from "./server-control-ui-root.js";
export * from "./server-cron-lazy.js";
export * from "./server-cron-notifications.js";
export * from "./server-cron.js";
export * from "./server-discovery-runtime.js";
export * from "./server-http.js";
export * from "./server-lanes.js";
export * from "./server-maintenance.js";
export * from "./server-methods-list.js";
export * from "./server-methods.js";
export * from "./server-network-runtime.js";
export * from "./server-node-events-types.js";
export * from "./server-node-events.js";
export * from "./server-node-session-runtime.js";
export * from "./server-node-subscriptions.js";
export * from "./server-plugin-bootstrap.js";
export * from "./server-plugins.js";
export * from "./server-reload-handlers.js";
export * from "./server-request-context.js";
export * from "./server-restart-sentinel.js";
export * from "./server-runtime-handles.js";
export * from "./server-runtime-service-shared.js";
export * from "./server-runtime-startup-services.js";
export * from "./server-runtime-subscriptions.js";
export * from "./server-session-events.js";
export * from "./server-session-key.js";
export * from "./server-shared-auth-generation.js";
export * from "./server-startup-config.js";
export * from "./server-startup-memory.js";
export * from "./server-startup-plugins.js";
export * from "./server-tailscale.js";
export * from "./server-talk-nodes.js";
export * from "./server-utils.js";
export * from "./server-wizard-sessions.js";
export * from "./server-ws-runtime.js";
export * from "./session-event-payload.js";
export * from "./session-history-state.js";
export * from "./session-kill-http.js";
export * from "./session-store-key.js";
export * from "./session-subagent-reactivation.runtime.js";
export * from "./session-subagent-reactivation.js";
export * from "./session-transcript-index.fs.js";
export * from "./sessions-history-http.js";
export * from "./talk-agent-consult.js";
export * from "./talk-handoff.js";
export * from "./talk-realtime-relay.js";
export * from "./talk-relay-session-lifecycle.js";
export * from "./talk-session-registry.js";
export * from "./talk-transcription-relay.js";

// 以下 stub 文件因导出符号与其他文件冲突，未通过 export * 导出（可通过相对路径直接导入）：
//   - call.runtime.ts
//   - chat-abort.ts
//   - chat-attachments.ts
//   - config-reload-plan.ts
//   - config-reload.ts
//   - credential-planner.ts
//   - credentials.ts
//   - hooks.ts
//   - hooks.types.ts
//   - http-auth-utils.ts
//   - http-utils.ts
//   - mcp-http.loopback-runtime.ts
//   - mcp-http.ts
//   - model-pricing-cache.ts
//   - node-registry.ts
//   - openresponses-http.ts
//   - openresponses-prompt.ts
//   - probe-auth.ts
//   - probe-target.ts
//   - server-aux-handlers.ts
//   - server-aux-methods.ts
//   - server-channels.ts
//   - server-chat-state.ts
//   - server-chat.ts
//   - server-discovery.ts
//   - server-model-catalog.ts
//   - server-node-events.runtime.ts
//   - server-shared.ts
//   - server.impl.ts
//   - session-archive.fs.ts
//   - session-archive.runtime.ts
//   - session-transcript-files.fs.ts
//   - session-utils.fs.ts
//   - tools-invoke-shared.ts

// ============================================================================
// 新增 stub 导出 — 移植自 openclaw/src/gateway（重度降级 stub 模式）
// ============================================================================
export * from "./agent-id-shared.js";
export * from "./agent-job.js";
export * from "./agent-timestamp.js";
// CONFLICT (TS2308): export * from "./agent-wait-dedupe.js";
export * from "./agent.js";
export * from "./agents-config-mutations.js";
// CONFLICT (TS2308): export * from "./agents.js";
export * from "./approval-shared.js";
export * from "./artifacts.js";
export * from "./attachment-normalize.js";
export * from "./auth-context.js";
export * from "./auth-messages.js";
export * from "./base-hash.js";
export * from "./channels.js";
export * from "./chat-reply-media.js";
export * from "./chat-transcript-inject.js";
export * from "./chat-webchat-media.js";
// CONFLICT (TS2308): export * from "./chat.js";
export * from "./close-reason.js";
export * from "./commands-list-result.js";
// CONFLICT (TS2308): export * from "./commands.js";
export * from "./config-write-flow.js";
export * from "./config.js";
export * from "./connect-policy.js";
export * from "./connect.js";
export * from "./cron.js";
export * from "./device-management-authz.js";
export * from "./device-management-security.js";
export * from "./devices.js";
export * from "./diagnostics.js";
export * from "./doctor.memory-core-runtime.js";
export * from "./doctor.js";
export * from "./environments.js";
export * from "./event-loop-health.js";
export * from "./exec-approval.js";
export * from "./exec-approvals.js";
export * from "./handshake-auth-helpers.js";
export * from "./handshake-auth-log-limiter.js";
export * from "./health-state.js";
export * from "./health.js";
export * from "./hook-client-ip-config.js";
export * from "./hooks-request-handler.js";
export * from "./http-listen.js";
export * from "./logs.js";
// CONFLICT (TS2308): export * from "./message-handler.js";
export * from "./models-auth-status.js";
export * from "./models-list-result.js";
// CONFLICT (TS2308): export * from "./models.js";
export * from "./native-hook-relay.js";
export * from "./nodes-pending.js";
// CONFLICT (TS2308): export * from "./nodes-wake-state.js";
export * from "./nodes.handlers.invoke-result.js";
export * from "./nodes.helpers.js";
// CONFLICT (TS2308): export * from "./nodes.js";
export * from "./optional-model-catalog.js";
export * from "./path-context.js";
export * from "./plugin-approval.js";
export * from "./plugin-host-hooks.js";
export * from "./plugin-node-capability-auth.js";
export * from "./plugin-route-runtime-scopes.js";
// CONFLICT (TS2308): export * from "./plugins-http.js";
export * from "./preauth-connection-budget.js";
export * from "./presence-events.js";
export * from "./push.js";
export * from "./readiness.js";
export * from "./record-shared.js";
export * from "./restart-request.js";
export * from "./restart.js";
// CONFLICT (TS2308): export * from "./route-auth.js";
export * from "./route-capability.js";
// CONFLICT (TS2308): export * from "./route-match.js";
export * from "./secrets.js";
export * from "./send.js";
export * from "./session-active-runs.js";
export * from "./session-change-event.js";
export * from "./sessions-files.js";
export * from "./sessions.runtime.js";
export * from "./sessions.js";
export * from "./shared-types.js";
export * from "./skills-upload.js";
export * from "./skills.js";
export * from "./system.js";
export * from "./talk-client.js";
export * from "./talk-session.js";
export * from "./talk-shared.js";
export * from "./talk.js";
export * from "./tasks.js";
export * from "./tls.js";
export * from "./tools-catalog.js";
export * from "./tools-effective.runtime.js";
// CONFLICT (TS2308): export * from "./tools-effective.js";
export * from "./tools-invoke.js";
export * from "./tts.js";
export * from "./types.js";
export * from "./unauthorized-flood-guard.js";
export * from "./update.js";
// CONFLICT (TS2308): export * from "./usage.js";
export * from "./validation.js";
export * from "./voicewake-routing.js";
export * from "./voicewake.js";
export * from "./web.js";
export * from "./wizard.js";
export * from "./ws-connection.js";
export * from "./ws-shared-generation.js";
export * from "./ws-types.js";

// 测试基础设施 stub 导出
export * from "./gateway-connection.test-mocks.js";
export * from "./hooks-test-helpers.js";
export * from "./live-env-test-helpers.js";
export * from "./server-http.test-harness.js";
export * from "./server.agent.gateway-server-agent.mocks.js";
export * from "./server.auth.control-ui.suite.js";
export * from "./server.auth.default-token.suite.js";
export * from "./server.auth.modes.suite.js";
export * from "./server.e2e-registry-helpers.js";
// CONFLICT (TS2308): export * from "./server.e2e-ws-harness.js";
export * from "./test-helpers.agent-results.js";
export * from "./test-helpers.assertions.js";
export * from "./test-helpers.channels.js";
export * from "./test-helpers.config-runtime.js";
export * from "./test-helpers.config-snapshots.js";
export * from "./test-helpers.connected-session-store.js";
// CONFLICT (TS2308): export * from "./test-helpers.e2e.js";
export * from "./test-helpers.maintenance-state.js";
export * from "./test-helpers.mocks.js";
export * from "./test-helpers.node-invoke.js";
export * from "./test-helpers.openai-mock.js";
export * from "./test-helpers.plugin-registry.js";
export * from "./test-helpers.runtime-state.js";
export * from "./test-helpers.server-runtime-state.js";
// CONFLICT (TS2308): export * from "./test-helpers.server.js";
export * from "./test-helpers.speech.js";
export * from "./test-helpers.js";
export * from "./test-http-response.js";
export * from "./test-openai-responses-model.js";
export * from "./test-temp-config.js";
export * from "./test-utils.js";
export * from "./test-with-server.js";

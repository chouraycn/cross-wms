export { startGatewayServer, stopGatewayServer } from './server.js';
export type { GatewayServer, GatewayServerOptions } from './server.js';
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

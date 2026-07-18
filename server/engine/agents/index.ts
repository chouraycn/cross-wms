export {
  agentCreate,
  agentUpdate,
  agentDelete,
  agentGet,
  agentList,
} from '../agents.js';

export { agentRegistry, AgentRegistry } from '../agentRegistry.js';
export type { AgentProfile, AgentRole, AgentCapability } from '../agentRegistry.js';

export { AgentOrchestrator } from '../agentOrchestrator.js';

export {
  onAgentEvent,
  onAgentEventStream,
  onAgentRunEvent,
  onAgentEventForSession,
  emitAgentEvent,
} from '../agentEvents.js';

export {
  startAgentRun,
  abortAgentRun,
  getAgentRunStatus,
  startAgentRuntime,
  stopAgentRuntime,
} from '../agentRuntime.js';

export {
  agentExecutionManager,
  createAgentExecution,
  startAgentExecution,
  completeAgentExecution,
} from '../agentExecutionManager.js';

export { agentIdentityManager } from '../agentIdentity.js';

export { agentScenarioMatcher } from '../agentScenarioMatcher.js';

export { getDefaultAgentConfig } from './defaults.js';
export type { DefaultAgentConfig } from './defaults.js';

export { createAgentContext } from './context.js';
export type { AgentContext } from './context.js';

export { resolveAgentTimeout, DEFAULT_AGENT_TIMEOUT_MS } from './timeout.js';
export type { AgentTimeoutConfig } from './timeout.js';

export { trackAgentUsage, getAgentUsage, resetAgentUsage } from './usage.js';
export type { AgentUsage, AgentUsageRecord } from './usage.js';

export {
  getAgentState,
  setAgentState,
  getAgentHistory,
  canTransition,
  isTerminalState,
  isActiveState,
  clearAgentLifecycle,
} from './lifecycle.js';
export type { AgentLifecycleState, AgentLifecycleEvent } from './lifecycle.js';

export {
  recordRunOutcome,
  getAgentMetrics,
  listAgentMetrics,
  resetAgentMetrics,
  getTopPerformers,
} from './metrics.js';
export type { AgentMetrics } from './metrics.js';

export {
  setAgentPermissionPolicy,
  getAgentPermissionPolicy,
  grantPermission,
  denyPermission,
  requireApprovalFor,
  checkPermission,
  clearAgentPermissions,
} from './permissions.js';
export type { AgentPermission, AgentPermissionPolicy } from './permissions.js';

export {
  createAuthProfile,
  getEffectiveAuthProfile,
  validateAuthProfile,
  refreshAuthProfile,
  registerAuthProfile,
  updateAuthProfile,
  getAuthProfile,
  listAuthProfiles,
  deleteAuthProfile,
  getAuthProfilesByProvider,
  isAuthProfileValid,
  clearAuthProfiles,
  setSessionAuthOverride,
  getSessionAuthOverride,
  clearSessionAuthOverride,
  applySessionOverride,
  listSessionAuthOverrides,
  cleanupExpiredOverrides,
  AuthProfileSchema,
} from './auth-profiles.js';
export type { AuthProfile, SessionAuthOverride } from './auth-profiles.js';

export {
  CliOutputFormatter,
  createCliOutputFormatter,
  formatCliOutput,
  CliOutputLineSchema,
} from './cli-output.js';
export type { CliOutputLine, CliOutputFormatterOptions } from './cli-output.js';

export {
  createCliSession,
  getCliSession,
  updateCliSession,
  addCommandHistory,
  completeCommandHistory,
  setSessionStatus,
  deleteCliSession,
  listCliSessions,
  getSessionHistory,
  clearCliSessions,
  CliSessionSchema,
} from './cli-session.js';
export type { CliSession } from './cli-session.js';

export {
  CliRunner,
  createCliRunner,
  runCliCommand,
} from './cli-runner.js';
export type { CliRunOptions, CliRunResult } from './cli-runner.js';

export {
  registerCliBackend,
  getCliBackend,
  listCliBackends,
  updateCliBackend,
  deleteCliBackend,
  runInBackend,
  cancelSessionRun,
  createBackendSession,
  cleanupSession,
  clearCliBackends,
  CliBackendConfigSchema,
} from './cli-backends.js';
export type { CliBackendConfig } from './cli-backends.js';

export {
  registerTool,
  unregisterTool,
  getTool,
  listTools,
  listToolNames,
  getToolsByCategory,
  getToolsByTag,
  listCategories,
  listTags,
  toolExists,
  clearToolCatalog,
  registerTools,
  ToolDefinitionSchema,
} from './tool-catalog.js';
export type { ToolDefinition } from './tool-catalog.js';

export {
  registerToolPolicy,
  getToolPolicy,
  listToolPolicies,
  updateToolPolicy,
  deleteToolPolicy,
  enableToolPolicy,
  disableToolPolicy,
  clearToolPolicies,
  matchToolPattern,
  matchAgentPattern,
  ToolPolicySchema,
} from './tool-policy.js';
export type { ToolPolicy } from './tool-policy.js';

export {
  evaluateToolPolicies,
  isToolAllowed,
  getMatchingPolicies,
} from './tool-policy-match.js';
export type {
  PolicyDecision,
  PolicyEvaluationContext,
  PolicyEvaluationResult,
} from './tool-policy-match.js';

export {
  registerPipelineHook,
  unregisterPipelineHook,
  listPipelineHooks,
  getHooksByStage,
  runPolicyPipeline,
  clearPipelineHooks,
} from './tool-policy-pipeline.js';
export type { PipelineStage, PipelineHook } from './tool-policy-pipeline.js';

export {
  truncateDescription,
  formatToolName,
  getToolCategoryIcon,
  sortTools,
  groupToolsByCategory,
  createToolDisplayConfig,
  filterToolsByQuery,
  ToolDisplayConfigSchema,
  DEFAULT_DISPLAY_CONFIG,
} from './tool-display-common.js';
export type { ToolDisplayConfig } from './tool-display-common.js';

export {
  registerToolImage,
  getToolImage,
  getToolImages,
  removeToolImage,
  clearToolImages,
  hasToolImage,
  listToolsWithImages,
  getToolIcon,
  ToolImageSchema,
} from './tool-images.js';
export type { ToolImage } from './tool-images.js';

export {
  searchTools,
  searchToolNames,
  fuzzySearchTools,
  getToolSuggestions,
} from './tool-search.js';
export type { ToolSearchQuery, ToolSearchResult } from './tool-search.js';

export {
  generateToolCallId,
  registerToolCall,
  getToolCallInfo,
  updateToolCallStatus,
  removeToolCall,
  listToolCallsBySession,
  listToolCallsByAgent,
  cleanupOldToolCalls,
  clearToolCallIds,
  ToolCallIdSchema,
} from './tool-call-id.js';
export type { ToolCallId } from './tool-call-id.js';

export {
  AgentIdentity,
  getPredefinedAgent,
  listPredefinedAgents,
  registerAgentIdentity,
  getAgentIdentity,
  listAgentIdentities,
  clearAgentIdentities,
} from './identity.js';
export type { AgentIdentityConfig } from './identity.js';

export {
  AgentSandbox,
  createAgentSandbox,
  getAgentSandbox,
  clearAgentSandboxes,
} from './sandbox.js';
export type { SandboxConfig } from './sandbox.js';

export {
  ExecutionLanes,
  executionLanes,
} from './executionLanes.js';
export type { LaneStatus } from './executionLanes.js';

export {
  UsageTracker,
  usageTracker,
} from './usageTracker.js';
export type { UsageStats, DailyUsage } from './usageTracker.js';

export {
  loadIdentityFile,
  saveIdentityFile,
  validateIdentityFile,
  createIdentityFile,
  updateIdentityFile,
  loadSoulMarkdown,
  loadMemoryMarkdown,
  saveSoulMarkdown,
  saveMemoryMarkdown,
  scanIdentityDirectory,
  IdentityFileSchema,
} from './identity-file.js';
export type { IdentityFile } from './identity-file.js';

export {
  createScope,
  getScope,
  updateScope,
  deleteScope,
  listScopes,
  getChildScopes,
  getScopeHierarchy,
  isToolAllowedInScope,
  isPathAllowedInScope,
  clearScopes,
  AgentScopeSchema,
} from './agent-scope.js';
export type { AgentScope } from './agent-scope.js';

export {
  setScopeConfig,
  getScopeConfig,
  createDefaultScope,
  createSessionScope,
  createAgentScope,
  resetScopeConfig,
  ScopeConfigSchema,
} from './agent-scope-config.js';
export type { ScopeConfig } from './agent-scope-config.js';

export {
  setSessionsBaseDir,
  getSessionsBaseDir,
  getSessionDir,
  ensureSessionDir,
  sessionDirExists,
  deleteSessionDir,
  getSessionFilePath,
  listSessionFiles,
  listAllSessions,
  getSessionMetadataPath,
  getSessionChatPath,
  getSessionToolCallsPath,
  getSessionMemoryPath,
  getSessionArtifactsDir,
  ensureSessionArtifactsDir,
  cleanupOldSessions,
} from './session-dirs.js';

export {
  acquireWriteLock,
  releaseWriteLock,
  hasWriteLock,
  getLockInfo,
  withWriteLock,
  forceReleaseWriteLock,
  clearAllWriteLocks,
} from './session-write-lock.js';
export type { WriteLockOptions } from './session-write-lock.js';

export {
  isJsonValid,
  isJsonlValid,
  repairJsonFile,
  repairJsonlFile,
  repairSessionFiles,
  backupFile,
  validateSessionFiles,
} from './session-file-repair.js';
export type { RepairResult } from './session-file-repair.js';

export {
  createAsyncTask,
  getAsyncTask,
  updateAsyncTask,
  startAsyncTask,
  completeAsyncTask,
  failAsyncTask,
  cancelAsyncTask,
  updateTaskProgress,
  listSessionTasks,
  getActiveTaskCount,
  cleanupCompletedTasks,
  clearAsyncTasks,
  AsyncTaskStatusSchema,
} from './session-async-task-status.js';
export type { AsyncTaskStatus } from './session-async-task-status.js';

export {
  registerModel,
  unregisterModel,
  getModel,
  listModels,
  listProviders,
  getModelsByProvider,
  getModelsByType,
  modelExists,
  findBestModel,
  calculateCost,
  clearModels,
  registerModels,
  ModelInfoSchema,
} from './model-scan.js';
export type { ModelInfo } from './model-scan.js';

export {
  createModelRuntimePolicy,
  getModelRuntimePolicy,
  updateModelRuntimePolicy,
  deleteModelRuntimePolicy,
  listModelRuntimePolicies,
  resolveModelForPolicy,
  getEffectiveMaxTokens,
  clearModelRuntimePolicies,
  ModelRuntimePolicySchema,
} from './model-runtime-policy.js';
export type { ModelRuntimePolicy } from './model-runtime-policy.js';

export {
  getDefaultThinkingConfig,
  createThinkingConfig,
  isThinkingEnabled,
  getThinkingBudget,
  adjustThinkingForModel,
  getThinkingModeDescription,
  listThinkingModes,
  ThinkingModeSchema,
  ThinkingConfigSchema,
  DEFAULT_THINKING_CONFIG,
} from './model-thinking-default.js';
export type { ThinkingMode, ThinkingConfig } from './model-thinking-default.js';

export {
  registerTransportConfig,
  getTransportConfig,
  listTransportConfigs,
  updateTransportConfig,
  deleteTransportConfig,
  getTransportConfigsByType,
  createStdioConfig,
  createHttpConfig,
  clearTransportConfigs,
  McpTransportConfigSchema,
  McpStdioTransportConfigSchema,
  McpHttpTransportConfigSchema,
  McpSseTransportConfigSchema,
  McpWebsocketTransportConfigSchema,
} from './mcp-transport-config.js';
export type {
  McpTransportConfig,
  McpStdioTransportConfig,
  McpHttpTransportConfig,
  McpSseTransportConfig,
  McpWebsocketTransportConfig,
} from './mcp-transport-config.js';

export {
  McpStdioTransport,
  createMcpStdioTransport,
} from './mcp-stdio.js';
export type {
  McpStdioTransportOptions,
  McpMessage,
} from './mcp-stdio.js';

export {
  McpHttpTransport,
  createMcpHttpTransport,
} from './mcp-http.js';
export type {
  McpHttpTransportOptions,
} from './mcp-http.js';

export {
  registerBasicTools,
  executeBasicTool,
  isBasicTool,
  BasicToolInputSchema,
} from './agent-tools-basics.js';

export {
  toOpenAIFunction,
  fromOpenAIFunction,
  toAnthropicTool,
  fromAnthropicTool,
  toOpenAIFunctions,
  fromOpenAIFunctions,
  toMCPTool,
  fromMCPTool,
  validateToolDefinition,
  normalizeToolDefinition,
  mergeToolDefinitions,
} from './agent-tool-definition-adapter.js';
export type {
  OpenAIFunctionDefinition,
  AnthropicToolDefinition,
  MCPToolDefinition,
} from './agent-tool-definition-adapter.js';

export {
  createPathPolicy,
  getPathPolicy,
  updatePathPolicy,
  deletePathPolicy,
  listPathPolicies,
  isPathAllowed,
  canWrite,
  canRead,
  clearPathPolicies,
  PathPolicySchema,
} from './path-policy.js';
export type { PathPolicy } from './path-policy.js';

export {
  waitFor,
  sleep,
  withTimeout,
  retry,
  poll,
} from './run-wait.js';
export type {
  WaitOptions,
  PollResult,
} from './run-wait.js';

export {
  startTraceSpan,
  endTraceSpan,
  recordTraceEvent,
  getTraceEvents,
  getActiveSpanCount,
  onTraceEvent,
  clearTraceEvents,
  getTraceStats,
  withTrace,
  TraceEventSchema,
} from './trace-base.js';
export type { TraceEvent } from './trace-base.js';

export {
  Workspace,
  createWorkspace,
  getWorkspace,
  listWorkspaces,
  deleteWorkspace,
  clearWorkspaces,
  WorkspaceConfigSchema,
} from './workspace.js';
export type { WorkspaceConfig } from './workspace.js';

export {
  redactPayload,
  redactHeaders,
  isSensitiveField,
  createRedactor,
} from './payload-redaction.js';
export type { RedactionOptions } from './payload-redaction.js';

export {
  quoteShellArg,
  buildShellCommand,
  parseShellCommand,
  getShellName,
  isSafeCommand,
  expandTilde,
  normalizePath,
  joinPaths,
  getFileExtension,
  isExecutable,
  formatBytes,
  formatDuration,
  generateId,
  truncateText,
  deepClone,
  mergeDeep,
} from './shell-utils.js';

export * from './embedded-agent/index.js';
export * from './provider-transport/index.js';
export * from './agent-tools/index.js';
export * from './agent-memory/index.js';
export * from './agent-context/index.js';
export * from './providers/index.js';

// PTY 终端辅助
export {
  stripDsrRequests,
  buildCursorPositionResponse,
} from "./pty-dsr.js";
export {
  hasCursorModeSensitiveKeys,
  encodeKeySequence,
  encodePaste,
} from "./pty-keys.js";

// 从 openclaw 移植的低依赖 agent 模块
export {
  resolveMaxTokensParam,
  canonicalizeMaxTokensParam,
} from "./model-max-tokens-params.js";

export { supportsGptParallelToolCallsPayload } from "./provider-api-families.js";

export {
  resolveImageSanitizationLimits,
  DEFAULT_IMAGE_MAX_DIMENSION_PX,
  DEFAULT_IMAGE_MAX_BYTES,
} from "./image-sanitization.js";
export type { ImageSanitizationLimits } from "./image-sanitization.js";

export { buildModelAliasLines } from "./model-alias-lines.js";

export {
  shouldAllowCooldownProbeForReason,
  shouldUseTransientCooldownProbeSlot,
  shouldPreserveTransientCooldownProbeSlot,
} from "./failover-policy.js";
export type { FailoverReason } from "./failover-policy.js";

export {
  mediaUrlsFromGeneratedAttachments,
  formatGeneratedAttachmentLines,
} from "./generated-attachments.js";
export type { AgentGeneratedAttachment } from "./generated-attachments.js";

export {
  formatAgentInternalEventsForPrompt,
  formatAgentInternalEventsForPlainPrompt,
  INTERNAL_RUNTIME_CONTEXT_BEGIN,
  INTERNAL_RUNTIME_CONTEXT_END,
} from "./internal-events.js";
export type { AgentInternalEvent } from "./internal-events.js";

export {
  OPENAI_PROVIDER_ID,
  OPENAI_CODEX_PROVIDER_ID,
  isOpenAIProvider,
  openAIProviderUsesCodexRuntimeByDefault,
  parseModelRefProvider,
  modelSelectionShouldEnsureCodexPlugin,
  listOpenAIAuthProfileProvidersForAgentRuntime,
  resolveOpenAIRuntimeProvider,
  resolveSelectedOpenAIRuntimeProvider,
  resolveContextConfigProviderForRuntime,
} from "./openai-routing.js";

export {
  normalizeOpenAIReasoningEffort,
  isOpenAIGpt54MiniModel,
  isOpenAIGpt55Model,
  resolveOpenAISupportedReasoningEfforts,
  supportsOpenAIReasoningEffort,
  resolveOpenAIReasoningEffortForModel,
} from "./openai-reasoning-effort.js";
export type {
  OpenAIReasoningEffort,
  OpenAIApiReasoningEffort,
} from "./openai-reasoning-effort.js";

export {
  REQUIRED_PARAM_GROUPS,
  getToolParamsRecord,
  stripMalformedXmlArgValueSuffix,
  normalizeHallucinatedOfficePathExtension,
  normalizeFileToolPathParam,
  stripMalformedXmlArgValueSuffixFromKeys,
  normalizeFileToolPathParamsFromKeys,
  assertRequiredParams,
  wrapToolParamValidation,
} from "./agent-tools.params.js";
export type { RequiredParamGroup } from "./agent-tools.params.js";

export { resolveConfiguredProviderFallback } from "./configured-provider-fallback.js";

export { applyUpdateHunk } from "./apply-patch-update.js";

// 工具结果错误检测（移植自 openclaw agents/tool-result-error）
export {
  readToolResultDetails,
  readToolResultStatus,
  isToolResultError,
} from "./tool-result-error.js";

// Agent run 超时归因（移植自 openclaw agents/run-timeout-attribution）
export {
  normalizeAgentRunTimeoutPhase,
  normalizeProviderStarted,
  type AgentRunTimeoutPhase,
} from "./run-timeout-attribution.js";

// 待处理 tool-call 状态跟踪（移植自 openclaw agents/session-tool-result-state）
export { createPendingToolCallState } from "./session-tool-result-state.js";

// Provider system prompt 贡献类型（移植自 openclaw agents/system-prompt-contribution）
export type {
  ProviderSystemPromptSectionId,
  ProviderSystemPromptContribution,
} from "./system-prompt-contribution.js";

// 运行时工具输入 schema JSON 投影（移植自 openclaw agents/tool-schema-json-projection）
export {
  projectRuntimeToolInputSchema,
  type RuntimeToolInputSchemaJson,
  type RuntimeToolInputSchemaProjection,
} from "./tool-schema-json-projection.js";

// Async stream iterator 包装器（移植自 openclaw agents/stream-iterator-wrapper）
export { createStreamIteratorWrapper } from "./stream-iterator-wrapper.js";

// MCP server/tool 名称净化（移植自 openclaw agents/agent-bundle-mcp-names）
export {
  sanitizeServerName,
  buildSafeToolName,
  normalizeReservedToolNames,
  TOOL_NAME_SEPARATOR,
} from "./agent-bundle-mcp-names.js";

// 紧凑工具错误摘要类型（移植自 openclaw agents/tool-error-summary）
export {
  isExecLikeToolName,
  type ToolErrorSummary,
  type FileTarget,
} from "./tool-error-summary.js";

// OpenAI 兼容会话轮次检测（移植自 openclaw agents/openai-compatible-conversation-turn）
export { hasOpenAICompatibleConversationTurn } from "./openai-compatible-conversation-turn.js";

// OpenAI reasoning effort 映射（移植自 openclaw agents/openai-reasoning-compat）
export { resolveOpenAIReasoningEffortMap } from "./openai-reasoning-compat.js";

// OpenAI text verbosity 解析（移植自 openclaw agents/openai-text-verbosity）
export { resolveOpenAITextVerbosity } from "./openai-text-verbosity.js";
export type { OpenAITextVerbosity } from "./openai-text-verbosity.js";

// OpenAI responses replay ID 解析（移植自 openclaw agents/openai-responses-replay）
export { resolveReplayableResponsesMessageId } from "./openai-responses-replay.js";

// OpenAI responses payload 策略（移植自 openclaw agents/openai-responses-payload-policy）
export {
  resolveOpenAIResponsesPayloadPolicy,
  applyOpenAIResponsesPayloadPolicy,
} from "./openai-responses-payload-policy.js";

// OpenAI strict tool 设置（移植自 openclaw agents/openai-strict-tool-setting）
export { resolveOpenAIStrictToolSetting } from "./openai-strict-tool-setting.js";

// OpenAI completions 兼容性检测（移植自 openclaw agents/openai-completions-compat）
export {
  resolveOpenAICompletionsCompatDefaults,
  detectOpenAICompletionsCompat,
} from "./openai-completions-compat.js";

// OpenAI 工具投影（移植自 openclaw agents/openai-tool-projection）
export {
  projectOpenAITools,
  reconcileOpenAIResponsesToolChoice,
  reconcileOpenAICompletionsToolChoice,
} from "./openai-tool-projection.js";
export type { OpenAIToolProjection } from "./openai-tool-projection.js";

// OpenAI 工具 schema 规范化（移植自 openclaw agents/openai-tool-schema）
export {
  clearOpenAIToolSchemaCacheForTest,
  normalizeStrictOpenAIJsonSchema,
  normalizeOpenAIStrictToolParameters,
  isStrictOpenAIJsonSchemaCompatible,
  findOpenAIStrictToolProjectionDiagnostics,
  resolveOpenAIProjectedToolsStrictToolFlag,
} from "./openai-tool-schema.js";

// MCP 配置共享工具（移植自 openclaw agents/mcp-config-shared）
export {
  isMcpConfigRecord,
  toMcpStringRecord,
  toMcpEnvRecord,
  toMcpStringArray,
} from "./mcp-config-shared.js";

// Agent run 终止常量与错误工厂（移植自 openclaw agents/run-termination）
export {
  AGENT_RUN_ABORTED_ERROR,
  AGENT_RUN_RESTART_ABORT_STOP_REASON,
  createAgentRunRestartAbortError,
  isAgentRunRestartAbortReason,
  resolveAgentRunAbortLifecycleFields,
  isAbortedAgentStopReason,
} from "./run-termination.js";

// Prompt cache 稳定化辅助（移植自 openclaw agents/prompt-cache-stability）
export {
  normalizeStructuredPromptSection,
  normalizePromptCapabilityIds,
} from "./prompt-cache-stability.js";

// Owner 显示设置（移植自 openclaw agents/owner-display）
export {
  resolveOwnerDisplaySetting,
  ensureOwnerDisplaySecret,
} from "./owner-display.js";

// Agent cleanup 超时保护（移植自 openclaw agents/run-cleanup-timeout）
export { runAgentCleanupStep } from "./run-cleanup-timeout.js";

// 可变助手消息事件流类型（移植自 openclaw agents/stream-compat）
export type {
  AssistantMessage,
  AssistantMessageEvent,
  MutableAssistantMessageEventStream,
} from "./stream-compat.js";

// 默认 agent 工作区目录解析（移植自 openclaw agents/workspace-default）
export {
  resolveDefaultAgentWorkspaceDir,
  DEFAULT_AGENT_WORKSPACE_DIR,
} from "./workspace-default.js";

// Agent 工作区目录集合（移植自 openclaw agents/workspace-dirs）
export { listAgentWorkspaceDirs } from "./workspace-dirs.js";

// 沙箱工具策略选择（移植自 openclaw agents/sandbox-tool-policy）
export {
  pickSandboxToolPolicy,
  IMPLICIT_ALLOW_ALL_FROM_ALSO_ALLOW,
} from "./sandbox-tool-policy.js";
export type { SandboxToolPolicy } from "./sandbox-tool-policy.js";

// Code Mode JSON-safe 值转换（移植自 openclaw agents/code-mode-json）
export { toCodeModeJsonSafe } from "./code-mode-json.js";

// 模型上下文窗口缓存（移植自 openclaw agents/context-cache）
export {
  MODEL_CONTEXT_TOKEN_CACHE,
  MODEL_CONFIGURED_CONTEXT_TOKEN_CACHE,
  MODEL_CONTEXT_WINDOW_CACHE,
  providerContextTokenCacheKey,
  lookupCachedContextTokens,
  lookupCachedContextWindow,
  minPositiveContextTokens,
} from "./context-cache.js";

// 上下文窗口 guard 与警告/阻断消息（移植自 openclaw agents/context-window-guard）
export {
  CONTEXT_WINDOW_HARD_MIN_TOKENS,
  resolveContextWindowInfo,
  formatContextWindowWarningMessage,
  formatContextWindowBlockMessage,
  evaluateContextWindowGuard,
} from "./context-window-guard.js";
export type {
  ContextWindowInfo,
  ContextWindowGuardResult,
} from "./context-window-guard.js";

// 上下文 token 解析（移植自 openclaw agents/context-resolution）
export {
  ANTHROPIC_CONTEXT_1M_TOKENS,
  ANTHROPIC_VERTEX_CONTEXT_1M_TOKENS,
  ANTHROPIC_FABLE_CONTEXT_TOKENS,
  resolveAnthropicFixedContextWindow,
  resolveContextTokensForModelFromCache,
} from "./context-resolution.js";
export type {
  ModelsConfig,
  ContextTokenResolutionParams,
} from "./context-resolution.js";

// 上下文窗口运行时状态（移植自 openclaw agents/context-runtime-state）
export {
  CONTEXT_WINDOW_RUNTIME_STATE,
  beginContextWindowCacheRefresh,
  resetContextWindowCacheForTest,
} from "./context-runtime-state.js";

// Code Mode 控制工具标记与 hook 参数规范化（移植自 openclaw agents/code-mode-control-tools）
export {
  CODE_MODE_EXEC_TOOL_NAME,
  CODE_MODE_WAIT_TOOL_NAME,
  CODE_MODE_EXEC_TOOL_KIND,
  markCodeModeControlTool,
  isCodeModeControlTool,
  getCodeModeExecBeforeHookMetadata,
  getCodeModeExecBeforeHookMetadataForToolKind,
  normalizeCodeModeExecBeforeHookParams,
  normalizeCodeModeExecBeforeHookParamsForToolKind,
  reconcileCodeModeExecBeforeHookParams,
} from "./code-mode-control-tools.js";
export type {
  CodeModeExecToolKind,
  CodeModeExecToolInputKind,
  CodeModeExecHookMetadata,
} from "./code-mode-control-tools.js";

// Code Mode 命名空间注册与运行时投影（移植自 openclaw agents/code-mode-namespaces）
export {
  createCodeModeNamespaceTool,
  registerCodeModeNamespaceForPlugin,
  listCodeModeNamespaces,
  clearCodeModeNamespacesForTest,
  clearCodeModeNamespacesForPlugin,
  createCodeModeApiVirtualFiles,
  describeCodeModeNamespacesForPrompt,
  createCodeModeNamespaceRuntime,
} from "./code-mode-namespaces.js";
export type {
  CodeModeNamespaceContext,
  CodeModeNamespaceScope,
  CodeModeNamespaceToolInputMapper,
  CodeModeNamespaceToolCall,
  CodeModeNamespaceRegistration,
  RegisteredCodeModeNamespace,
  SerializedCodeModeNamespaceValue,
  CodeModeNamespaceDescriptor,
  CodeModeNamespaceRuntime,
  CodeModeApiVirtualFile,
} from "./code-mode-namespaces.js";

// Cron 风格当前时间提示文本（移植自 openclaw agents/current-time）
export {
  resolveCronStyleNow,
  appendCronStyleCurrentTimeLine,
} from "./current-time.js";
export type { CronStyleNow, TimeFormatPreference } from "./current-time.js";

// Prompt surface 工具指导辅助（移植自 openclaw agents/prompt-surface）
export {
  buildOpenClawToolFallbackText,
  shouldRenderOpenClawToolWorkflowHints,
  resolveAgentPromptSurfaceForSessionKey,
} from "./prompt-surface.js";

// OpenClaw 文档/源码根路径解析（移植自 openclaw agents/docs-path）
export {
  OPENCLAW_DOCS_URL,
  OPENCLAW_SOURCE_URL,
  resolveOpenClawReferencePaths,
} from "./docs-path.js";

// Agent 命令队列 lane 名称解析（移植自 openclaw agents/lanes）
export {
  AGENT_LANE_NESTED,
  AGENT_LANE_CRON_NESTED,
  AGENT_LANE_SUBAGENT,
  resolveCronAgentLane,
  resolveNestedAgentLaneForSession,
  isNestedAgentLane,
} from "./lanes.js";

// 按路径排队的追加写入器（移植自 openclaw agents/queued-file-writer）
export {
  getQueuedFileWriter,
} from "./queued-file-writer.js";
export type {
  QueuedFileWriter,
  QueuedFileWriterDiagnostics,
} from "./queued-file-writer.js";

// MiniMax VLM 图像理解请求适配（移植自 openclaw agents/minimax-vlm）
export {
  isMinimaxVlmProvider,
  isMinimaxVlmModel,
  minimaxUnderstandImage,
} from "./minimax-vlm.js";

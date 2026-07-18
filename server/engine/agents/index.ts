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

// ============================================================================
// 降级 stub 导出（移植自 openclaw agents/ 子系统剩余文件）
// 这些模块为降级 stub：类型降级为 unknown，函数体抛出 "not implemented"。
// 仅供类型兼容与模块解析使用，运行时调用会抛错。
// ============================================================================
export type { AgentRuntimeMetadata } from "./acp-runtime-overlay.js";
export { applyAcpRuntimeOverlay } from "./acp-runtime-overlay.js";
export type { AcpSpawnParentRelayHandle } from "./acp-spawn-parent-stream.js";
export { resolveAcpSpawnStreamLogPath, startAcpSpawnParentStreamRelay } from "./acp-spawn-parent-stream.js";
export type { AgentCredentialMap } from "./agent-auth-credentials.js";
export { resolveAgentCredentialMapFromStore } from "./agent-auth-credentials.js";
export type { AgentDiscoveryAuthLookupOptions } from "./agent-auth-discovery-core.js";
export { addEnvBackedAgentCredentials } from "./agent-auth-discovery-core.js";
export type { DiscoverAuthStorageOptions } from "./agent-auth-discovery.js";
export { resolveAgentCredentialsForDiscovery } from "./agent-auth-discovery.js";
export type { BundleLspToolRuntime } from "./agent-bundle-lsp-runtime.js";
export { spawnLspServerProcess, createBundleLspToolRuntime, disposeAllBundleLspRuntimes } from "./agent-bundle-lsp-runtime.js";
export { buildBundleMcpToolsFromCatalog, materializeBundleMcpToolsForRun, createBundleMcpToolRuntime } from "./agent-bundle-mcp-materialize.js";
export { createBundleMcpJsonSchemaValidator, resolveSessionMcpConfigSummary, createSessionMcpRuntime, getSessionMcpRuntimeManager, getOrCreateSessionMcpRuntime, peekSessionMcpRuntime, disposeSessionMcpRuntime, retireSessionMcpRuntime, retireSessionMcpRuntimeForSessionKey, disposeAllSessionMcpRuntimes } from "./agent-bundle-mcp-runtime.js";
export type { BundleMcpToolRuntime, McpCatalogTool, McpServerCatalog, McpToolCatalog, McpToolCatalogDiagnostic, SessionMcpRuntime, SessionMcpRuntimeManager } from "./agent-bundle-mcp-tools.js";
export { agentCommand, agentCommandFromIngress } from "./agent-command.js";
export { findOverlappingWorkspaceAgentIds } from "./agent-delete-safety.js";
export { registerResolvedAgentDir, resolveRegisteredAgentIdForDir } from "./agent-dir-registry.js";
export { normalizeDiscoveredAgentModel, discoverAuthStorage, discoverModels } from "./agent-model-discovery.js";
export { DEFAULT_EMBEDDED_AGENT_PROJECT_SETTINGS_POLICY, loadEnabledBundleAgentSettingsSnapshot, resolveEmbeddedAgentProjectSettingsPolicy, buildEmbeddedAgentSettingsSnapshot } from "./agent-project-settings-snapshot.js";
export { createPreparedEmbeddedAgentSettingsManager } from "./agent-project-settings.js";
export type { AgentRunTerminalOutcome } from "./agent-run-terminal-outcome.js";
export { isStickyAgentRunTerminalOutcome, buildAgentRunTerminalOutcome, buildAgentRunTerminalOutcomeFromWaitResult, mergeAgentRunTerminalOutcome } from "./agent-run-terminal-outcome.js";
export { resolveAgentRuntimeConfig } from "./agent-runtime-config.js";
export { resolveModelAgentRuntimeMetadata } from "./agent-runtime-metadata.js";
export { DEFAULT_AGENT_COMPACTION_RESERVE_TOKENS_FLOOR, applyAgentCompactionSettingsFromConfig, resolveEffectiveCompactionMode, isSilentOverflowProneModel, applyAgentAutoCompactionGuard } from "./agent-settings.js";
export { listPendingAgentSteeringItemsFromSubagentRuns, buildMergedAgentSteeringPrompt, leasePendingAgentSteeringItemsFromSubagentRuns, ackLeasedAgentSteeringItemsFromSubagentRuns, releaseLeasedAgentSteeringItemsFromSubagentRuns, prependAgentSteeringPrompt } from "./agent-steering-queue.js";
export type { ToolParameterSchemaOptions } from "./agent-tools-parameter-schema.js";
export { normalizeToolParameterSchema } from "./agent-tools-parameter-schema.js";
export { wrapToolWithAbortSignal } from "./agent-tools.abort.js";
export { beforeToolCallRuntime } from "./agent-tools.before-tool-call.runtime.js";
export type { ToolOutcomeObservation, ToolOutcomeObserver, HookContext, DeferredPluginToolApproval, BeforeToolCallPolicyDiagnosticState } from "./agent-tools.before-tool-call.js";
export { BeforeToolCallBlockedError, getBeforeToolCallPolicyDiagnosticState, hasBeforeToolCallPolicy, resolveToolTerminalPresentation, finalizeToolTerminalPresentation, recordAdjustedParamsForToolCall, recordStructuredReplayTrustForToolCall, isBeforeToolCallBlockedError, requestDeferredPluginToolApproval, cancelDeferredPluginToolApproval, buildBlockedToolResult, runBeforeToolCallHook, wrapToolWithBeforeToolCallHook, isToolWrappedWithBeforeToolCallHook, setBeforeToolCallDiagnosticsEnabled, rewrapToolWithBeforeToolCallHook, copyBeforeToolCallHookMarker, consumeAdjustedParamsForToolCall, consumePreExecutionBlockedToolCall, peekAdjustedParamsForToolCall } from "./agent-tools.before-tool-call.js";
export { applyDeferredFollowupToolDescriptions } from "./agent-tools.deferred-followup.js";
export { filterToolsByMessageProvider } from "./agent-tools.message-provider-policy.js";
export { resolveSubagentToolPolicyForSession, resolveInheritedToolPolicyForSession, filterToolsByPolicy, resolveConfiguredToolPolicies, resolveTrustedGroupId, resolveEffectiveToolPolicy, resolveGroupToolPolicy } from "./agent-tools.policy.js";
export { wrapToolWorkspaceRootGuard, resolveToolPathAgainstWorkspaceRoot, wrapToolMemoryFlushAppendOnlyWrite, wrapToolWorkspaceRootGuardWithOptions, createSandboxedReadTool, createSandboxedWriteTool, createSandboxedEditTool, createHostWorkspaceWriteTool, createHostWorkspaceEditTool, createOpenClawReadTool } from "./agent-tools.read.js";
export { normalizeToolParameters } from "./agent-tools.schema.js";
export type { OpenClawCodingToolConstructionPlan } from "./agent-tools.js";
export { resolveProcessToolScopeKey, createOpenClawCodingTools, resolveToolLoopDetectionConfig } from "./agent-tools.js";
export { createAnthropicPayloadLogger } from "./anthropic-payload-log.js";
export { resolveAnthropicEphemeralCacheControl, resolveAnthropicPayloadPolicy, applyAnthropicPayloadPolicyToParams, applyAnthropicEphemeralCacheControlMarkers } from "./anthropic-payload-policy.js";
export type { AnthropicToolProjection, AnthropicProjectedToolChoice } from "./anthropic-tool-projection.js";
export { projectAnthropicTools, reconcileAnthropicToolChoice, resolveOriginalAnthropicToolName } from "./anthropic-tool-projection.js";
export { resolveAnthropicBaseUrl, resolveAnthropicMessagesUrl, createAnthropicMessagesTransportStreamFn } from "./anthropic-transport-stream.js";
export { createAnthropicVertexStreamFnForModel } from "./anthropic-vertex-stream.js";
export { collectProviderApiKeysForExecution, executeWithApiKeyRotation } from "./api-key-rotation.js";
export type { ApplyPatchPathExtractionOptions } from "./apply-patch-paths.js";
export { extractApplyPatchTargetPaths } from "./apply-patch-paths.js";
export type { AuthProfileHealthStatus, AuthProviderHealthStatus, AuthProviderHealth, AuthHealthSummary } from "./auth-health.js";
export { DEFAULT_OAUTH_WARN_MS, formatRemainingShort, buildAuthHealthSummary } from "./auth-health.js";
export { ensureAuthProfileStore } from "./auth-profiles.runtime.js";
export type { ActiveProcessSessionReference } from "./bash-process-references.js";
export { listActiveProcessSessionReferences } from "./bash-process-references.js";
export type { ProcessSession } from "./bash-process-registry.js";
export { createSessionSlug, addSession, getSession, getFinishedSession, deleteSession, appendOutput, drainSession, markExited, markBackgrounded, tail, listRunningSessions, listFinishedSessions, resetProcessRegistryForTests, setJobTtlMs } from "./bash-process-registry.js";
export { describeExecTool, describeProcessTool } from "./bash-tools.descriptions.js";
export { buildExecApprovalFollowupIdempotencyKey, parseExecApprovalFollowupApprovalId, registerExecApprovalFollowupRuntimeHandoff, consumeExecApprovalFollowupRuntimeHandoff, isExecApprovalFollowupSessionRebound, resetExecApprovalFollowupRuntimeHandoffsForTests } from "./bash-tools.exec-approval-followup-state.js";
export { buildExecApprovalFollowupPrompt, sendExecApprovalFollowup } from "./bash-tools.exec-approval-followup.js";
export { resolveExecApprovalCommandSpans } from "./bash-tools.exec-approval-request.runtime.js";
export type { ExecApprovalRegistration } from "./bash-tools.exec-approval-request.js";
export { registerExecApprovalRequest, resolveRegisteredExecApprovalDecision, buildExecApprovalRequesterContext, buildExecApprovalTurnSourceContext, registerExecApprovalRequestForHost, registerExecApprovalRequestForHostOrThrow } from "./bash-tools.exec-approval-request.js";
export { processGatewayAllowlist } from "./bash-tools.exec-host-gateway.js";
export { shouldSkipNodeApprovalPrepare, formatNodeRunToolResult, resolveNodeExecutionTarget, buildNodeSystemRunInvoke, invokeNodeSystemRunDirect, prepareNodeSystemRun, analyzeNodeApprovalRequirement } from "./bash-tools.exec-host-node-phases.js";
export { executeNodeHostCommand } from "./bash-tools.exec-host-node.js";
export type { ExecuteNodeHostCommandParams } from "./bash-tools.exec-host-node.types.js";
export type { ExecHostApprovalContext, ExecApprovalPendingState, ExecApprovalRequestState, ExecApprovalUnavailableReason, RegisteredExecApprovalRequestContext, ExecApprovalFollowupTarget, ExecApprovalFollowupResultDeps, DefaultExecApprovalRequestArgs } from "./bash-tools.exec-host-shared.js";
export { MAX_EXEC_APPROVAL_FOLLOWUP_FAILURE_LOG_KEYS, createExecApprovalPendingState, createExecApprovalRequestState, createExecApprovalRequestContext, createDefaultExecApprovalRequestContext, resolveBaseExecApprovalDecision, resolveExecHostApprovalContext, resolveApprovalDecisionOrUndefined, resolveExecApprovalUnavailableState, createAndRegisterDefaultExecApprovalRequest, buildDefaultExecApprovalRequestArgs, buildExecApprovalFollowupTarget, createExecApprovalDecisionState, enforceStrictInlineEvalApprovalBoundary, shouldResolveExecApprovalUnavailableInline, buildHeadlessExecApprovalDeniedMessage, sendExecApprovalFollowupResult, buildExecApprovalPendingToolResult } from "./bash-tools.exec-host-shared.js";
export { renderExecOutputText, renderExecUpdateText } from "./bash-tools.exec-output.js";
export type { ExecProcessFailureKind, ExecProcessOutcome, ExecProcessHandle } from "./bash-tools.exec-runtime.js";
export { DEFAULT_MAX_OUTPUT, DEFAULT_PENDING_MAX_OUTPUT, DEFAULT_PATH, DEFAULT_NOTIFY_TAIL_CHARS, DEFAULT_APPROVAL_TIMEOUT_MS, DEFAULT_APPROVAL_REQUEST_TIMEOUT_MS, detectCursorKeyMode, renderExecHostLabel, renderExecTargetLabel, isRequestedExecTargetAllowed, resolveExecTarget, normalizeNotifyOutput, applyShellPath, createApprovalSlug, buildApprovalPendingMessage, resolveApprovalRunningNoticeMs, formatExecFailureReason, buildExecExitOutcome, buildExecRuntimeErrorOutcome, runExecProcess, applyPathPrepend, findPathKey, normalizePathPrepend, normalizeExecAsk, normalizeExecHost, normalizeExecSecurity, normalizeExecTarget, execSchema } from "./bash-tools.exec-runtime.js";
export type { ExecToolDefaults, ExecApprovalFollowupOutcome, ExecApprovalFollowupFactory, ExecElevatedDefaults, ExecToolDetails } from "./bash-tools.exec-types.js";
export type { BashSandboxConfig } from "./bash-tools.exec.js";
export { execTool, createExecTool } from "./bash-tools.exec.js";
export type { WritableStdin } from "./bash-tools.process-send-keys.js";
export { handleProcessSendKeys } from "./bash-tools.process-send-keys.js";
export type { ProcessToolDefaults } from "./bash-tools.process.js";
export { processTool, createProcessTool } from "./bash-tools.process.js";
export { processSchema } from "./bash-tools.schemas.js";
export { buildSandboxEnv, coerceEnv, buildDockerExecArgs, resolveSandboxWorkdir, resolveWorkdir, clampWithDefault, readEnvInt, chunkString, truncateMiddle, sliceLogLines, deriveSessionName, pad } from "./bash-tools.shared.js";
export { resolveBootstrapWarningSignaturesSeen, buildBootstrapInjectionStats, analyzeBootstrapBudget, buildBootstrapPromptWarning, appendBootstrapPromptWarning, buildBootstrapPromptWarningNotice, buildBootstrapTruncationReportMeta } from "./bootstrap-budget.js";
export { getOrLoadBootstrapFiles, clearBootstrapSnapshot, clearBootstrapSnapshotOnSessionRollover, clearAllBootstrapSnapshots } from "./bootstrap-cache.js";
export type { BootstrapContextMode } from "./bootstrap-files.js";
export { FULL_BOOTSTRAP_COMPLETED_CUSTOM_TYPE, resetBootstrapWarningCacheForTest, resolveContextInjectionMode, hasCompletedBootstrapTurn, makeBootstrapWarn, resolveBootstrapFilesForRun, resolveBootstrapContextForRun, buildBootstrapContextForFiles } from "./bootstrap-files.js";
export { applyBootstrapHookOverrides } from "./bootstrap-hooks.js";
export type { BootstrapMode } from "./bootstrap-mode.js";
export { resolveBootstrapMode } from "./bootstrap-mode.js";
export { buildFullBootstrapPromptLines, buildLimitedBootstrapPromptLines } from "./bootstrap-prompt.js";
export { resolveBtwSessionTranscriptPath, readBtwTranscriptMessages } from "./btw-transcript.js";
export { toCliBundleMcpServerConfig, loadMergedBundleMcpConfig } from "./bundle-mcp-config.js";
export { createCacheTrace } from "./cache-trace.js";
export { listChannelSupportedActions, listAllChannelSupportedActions, listChannelAgentTools, resolveChannelMessageToolHints, resolveChannelPromptCapabilities, resolveChannelReactionGuidance, copyChannelAgentToolMeta, getChannelAgentToolMeta } from "./channel-tools.js";
export type { ChutesOAuthAppConfig } from "./chutes-oauth.js";
export { CHUTES_AUTHORIZE_ENDPOINT, CHUTES_TOKEN_ENDPOINT, CHUTES_USERINFO_ENDPOINT, generateChutesPkce, parseOAuthCallbackInput, exchangeChutesCodeForTokens, refreshChutesTokens } from "./chutes-oauth.js";
export { CLI_AUTH_EPOCH_VERSION, setCliAuthEpochTestDeps, resetCliAuthEpochTestDeps, resolveCliAuthEpoch } from "./cli-auth-epoch.js";
export type { ClaudeCliCredential, CodexCliCredential, MiniMaxCliCredential, GeminiCliCredential } from "./cli-credentials.js";
export { resetCliCredentialCachesForTest, readClaudeCliCredentials, readClaudeCliCredentialsCached, readCodexCliCredentials, readCodexCliCredentialsCached, readMiniMaxCliCredentialsCached, readGeminiCliCredentialsCached } from "./cli-credentials.js";
export type { CodeModeConfig } from "./code-mode.js";
export { resolveCodeModeConfig, createCodeModeTools, applyCodeModeCatalog, addClientToolsToCodeModeCatalog } from "./code-mode.js";
export type { CodexBundleMcpThreadConfig, CodexMcpServersConfig, LoadCodexBundleMcpThreadConfigParams } from "./codex-mcp-config.js";
export { normalizeCodexMcpServerConfig, buildCodexMcpServersConfig, loadCodexBundleMcpThreadConfig } from "./codex-mcp-config.js";
export type { NativeWebSearchToolPolicyParams } from "./codex-native-web-search-core.js";
export { isCodexNativeSearchEligibleModel, hasAvailableCodexAuth, resolveCodexNativeSearchActivation, isNativeWebSearchAllowedByToolPolicy, buildCodexNativeWebSearchTool, patchCodexNativeWebSearchPayload, shouldSuppressManagedWebSearchTool } from "./codex-native-web-search-core.js";
export type { CodexNativeSearchMode, CodexNativeSearchContextSize, CodexNativeSearchUserLocation, ResolvedCodexNativeWebSearchConfig } from "./codex-native-web-search.shared.js";
export { resolveCodexNativeWebSearchConfig, describeCodexNativeWebSearch } from "./codex-native-web-search.shared.js";
export { isCodexNativeWebSearchRelevant } from "./codex-native-web-search.js";
export { compactionPlanningWorkerTesting, buildSummaryChunksWithWorker, buildOversizedFallbackPlanWithWorker, buildStageSplitPlanWithWorker, buildHistoryPrunePlanWithWorker, computeAdaptiveChunkRatioWithWorker } from "./compaction-planning-worker.js";
export type { StageSplitPlan, OversizedFallbackPlan, HistoryPrunePlan } from "./compaction-planning.js";
export { BASE_CHUNK_RATIO, MIN_CHUNK_RATIO, SAFETY_MARGIN, SUMMARIZATION_OVERHEAD_TOKENS, estimateMessagesTokens, sanitizeCompactionMessages, estimateCompactionMessageTokens, normalizeCompactionParts, splitMessagesByTokenShare, chunkMessagesByMaxTokens, computeAdaptiveChunkRatio, isOversizedForSummary, buildSummaryChunks, buildOversizedFallbackPlan, buildStageSplitPlan, pruneHistoryForContextShare, buildHistoryPrunePlan } from "./compaction-planning.js";
export type { CompactionPlanningWorkerInput, CompactionPlanningWorkerValue, CompactionPlanningWorkerResult } from "./compaction-planning.worker.js";
export { runCompactionPlanningWorkerInput } from "./compaction-planning.worker.js";
export { hasMeaningfulConversationContent, isRealConversationMessage } from "./compaction-real-conversation.js";
export { stripStaleAssistantUsageBeforeLatestCompaction } from "./compaction-usage.js";
export type { CompactionSummarizationInstructions } from "./compaction.js";
export { buildCompactionSummarizationInstructions, summarizeWithFallback, summarizeInStages, resolveContextWindowTokens } from "./compaction.js";
export { isBunBinary, APP_NAME, CONFIG_DIR_NAME, VERSION, getThemesDir, getReadmePath, getDocsPath, getExamplesPath, getAgentDir, getCustomThemesDir, getBinDir, getSessionsDir } from "./config.js";
export { modelSelectionShouldEnsureCopilotRuntimePlugin } from "./copilot-routing.js";
export { ensureCustomApiRegistered } from "./custom-api-registry.js";
export type { BlockReplyChunking } from "./embedded-agent-block-chunker.js";
export { EmbeddedBlockChunker } from "./embedded-agent-block-chunker.js";
export { shouldSuppressRawErrorConsoleSuffix, buildApiErrorObservationFields, buildTextObservationFields } from "./embedded-agent-error-observation.js";
export type { EmbeddedContextFile } from "./embedded-agent-helpers.js";
export { isModelNotFoundErrorMessage } from "./embedded-agent-helpers.js";
export { loadEmbeddedAgentLspConfig } from "./embedded-agent-lsp.js";
export { loadEmbeddedAgentMcpConfig } from "./embedded-agent-mcp.js";
export { hasMessagingDeliveryReceipt, isDeliveredMessagingToolResult, isDeliveredMessageToolOnlySourceReplyResult } from "./embedded-agent-message-tool-source-reply.js";
export { isMessageToolSendActionName, isMessageToolConversationCreateActionName, isMessagingTool, isMessagingToolSendAction, isMessagingToolTargetEvidenceAction, isMessagingToolDeliveryAction } from "./embedded-agent-messaging.js";
export type { MessagingToolSend, MessagingToolSourceReplyPayload } from "./embedded-agent-messaging.types.js";
export type { BlockReplyPayload } from "./embedded-agent-payloads.js";
export { handleCompactionStart, handleCompactionEnd } from "./embedded-agent-subscribe.handlers.compaction.js";
export { handleAgentStart, handleAgentEnd } from "./embedded-agent-subscribe.handlers.lifecycle.js";
export { consumePendingToolMediaIntoReply, consumePendingToolMediaReply, readPendingToolMediaReply, consumePendingAssistantReplyDirectivesIntoReply, hasAssistantVisibleReply, handleMessageStart, handleMessageUpdate, handleMessageEnd } from "./embedded-agent-subscribe.handlers.messages.js";
export { countActiveToolExecutions, handleToolExecutionStart, handleToolExecutionUpdate, handleToolExecutionEnd } from "./embedded-agent-subscribe.handlers.tools.js";
export { createEmbeddedAgentSessionEventHandler } from "./embedded-agent-subscribe.handlers.js";
export type { ToolCallSummary, EmbeddedAgentSubscribeState, EmbeddedAgentSubscribeContext, ToolHandlerContext, EmbeddedAgentSubscribeEvent } from "./embedded-agent-subscribe.handlers.types.js";
export { isPromiseLike } from "./embedded-agent-subscribe.promise.js";
export { appendRawStream } from "./embedded-agent-subscribe.raw-stream.js";
export type { ToolResultFormat, ToolProgressDetailMode } from "./embedded-agent-subscribe.shared-types.js";
export { warnIfAssistantEmittedToolText } from "./embedded-agent-subscribe.tool-text-diagnostics.js";
export { buildToolLifecycleErrorResult, sanitizeToolArgs, sanitizeToolResult, extractToolResultText, collectMessagingMediaUrlsFromRecord, collectMessagingMediaUrlsFromToolResult, extractMessagingToolSourceReplyPayload, isToolResultMediaTrusted, filterToolResultMediaUrls, extractToolResultMediaArtifact, extractToolErrorCode, isToolResultTimedOut, extractToolErrorMessage, extractMessagingToolSend, extractMessagingToolSendResult } from "./embedded-agent-subscribe.tools.js";
export type { SubscribeEmbeddedAgentSessionParams } from "./embedded-agent-subscribe.js";
export { subscribeEmbeddedAgentSession } from "./embedded-agent-subscribe.js";
export { THINKING_TAG_SCAN_RE, isAssistantMessage, stripThinkingTagsFromText, sanitizeAssistantVisibleStreamText, extractAssistantVisibleText, extractAssistantText, extractAssistantThinking, formatReasoningMessage, splitThinkingTaggedText, promoteThinkingTagsToBlocks, extractThinkingFromTaggedText, extractThinkingFromTaggedStream, inferToolMetaFromArgs, stripModelSpecialTokens } from "./embedded-agent-utils.js";
export { DEFAULT_EXEC_REVIEWER_SYSTEM_PROMPT } from "./exec-auto-reviewer.prompt.js";
export type { ExecReviewerConfig } from "./exec-auto-reviewer.js";
export { parseExecAutoReviewResponse, resolveExecReviewerTimeoutMs, createModelExecAutoReviewer } from "./exec-auto-reviewer.js";
export { canExecRequestNode, resolveExecDefaults } from "./exec-defaults.js";
export { stripProviderPrefix, isStrictAgenticSupportedProviderModel, isStrictAgenticExecutionContractActive } from "./execution-contract.js";
export { FailoverError, isFailoverError, resolveFailoverStatus, isNonProviderRuntimeCoordinationError, isTimeoutError, isSignalTimeoutReason, resolveFailoverReasonFromError, buildFailoverRemediationHint, buildProviderReauthCommand, describeFailoverError, coerceToFailoverError } from "./failover-error.js";
export { resolveFastModeState } from "./fast-mode.js";
export { prepareGoogleSimpleCompletionModel } from "./google-simple-completion-stream.js";
export type { ConfiguredAgentHarnessRuntimeOptions } from "./harness-runtimes.js";
export { collectConfiguredAgentHarnessRuntimes } from "./harness-runtimes.js";
export { shouldIncludeHeartbeatGuidanceForSystemPrompt, resolveHeartbeatPromptForSystemPrompt } from "./heartbeat-system-prompt.js";
export type { AgentAvatarResolution } from "./identity-avatar.js";
export { resolvePublicAgentAvatarSource, resolveAgentAvatar } from "./identity-avatar.js";
export { IMAGE_GENERATION_TASK_KIND, findActiveImageGenerationTaskForSession, listActiveImageGenerationTasksForSession, findDuplicateGuardImageGenerationTaskForSession, buildImageGenerationTaskStatusDetails, buildImageGenerationTaskStatusListDetails, buildImageGenerationTaskStatusText, buildImageGenerationTaskStatusListText, buildActiveImageGenerationTaskPromptContextForSession } from "./image-generation-task-status.js";
export { collectProviderApiKeys, collectAnthropicApiKeys, isApiKeyRateLimitError, isAnthropicBillingError } from "./live-auth-keys.js";
export type { LiveCacheFloor } from "./live-cache-regression-baseline.js";
export { LIVE_CACHE_REGRESSION_BASELINE } from "./live-cache-regression-baseline.js";
export { runLiveCacheRegression } from "./live-cache-regression-runner.js";
export type { LiveResolvedModel, LiveResolvedModelPool } from "./live-cache-test-support.js";
export { LIVE_CACHE_TEST_ENABLED, LiveCachePrerequisiteSkip, isLiveCachePrerequisiteSkip, toLiveCachePrerequisiteSkip, logLiveCache, withLiveCacheHeartbeat, completeSimpleWithLiveTimeout, buildStableCachePrefix, buildAssistantHistoryTurn, computeCacheHitRate, resolveLiveDirectModelPool, resolveLiveDirectModel, withLiveDirectModelApiKey } from "./live-cache-test-support.js";
export { appendPrioritizedDynamicLiveModels } from "./live-model-dynamic-candidates.js";
export { DEFAULT_HIGH_SIGNAL_LIVE_MODEL_LIMIT, DEFAULT_SMALL_LIVE_MODEL_LIMIT, getHighSignalLiveModelProviders, isModernModelRef, isHighSignalLiveModelRef, isPrioritizedHighSignalLiveModelRef, isSmallLiveModelRef, listPrioritizedHighSignalLiveModelRefs, listPrioritizedSmallLiveModelRefs, shouldExcludeProviderFromDefaultHighSignalLiveSweep, selectHighSignalLiveItems, selectSmallLiveItems, resolveHighSignalLiveModelLimit, getHighSignalLiveModelPriorityIndex } from "./live-model-filter.js";
export type { LiveSessionModelSelection } from "./live-model-switch.js";
export { resolveLiveSessionModelSelection, hasDifferentLiveSessionModelSelection, shouldSwitchToLiveModel, clearLiveModelSwitchPending, LiveSessionModelSwitchError } from "./live-model-switch.js";
export { LIVE_MODEL_FILE_PROBE_TOKEN, LIVE_MODEL_FILE_PROBE_ENV, LIVE_MODEL_IMAGE_PROBE_ENV, isLiveModelProbeEnabled, modelSupportsImageInput, shouldSkipLiveModelExtraProbes, shouldSkipLiveModelFileProbe, shouldSkipLiveModelImageProbe, buildLiveModelFileProbeContext, buildLiveModelFileProbeRetryContext, buildLiveModelImageProbeContext, fileProbeTextMatches, imageProbeTextMatches } from "./live-model-turn-probes.js";
export { liveProvidersShareOwningPlugin } from "./live-provider-owner.js";
export { createLiveTargetMatcher } from "./live-target-matcher.js";
export type { CompleteSimpleContent } from "./live-test-helpers.js";
export { isLiveTestEnabled, isLiveProfileKeyModeEnabled, requiresLiveProfileCredential, resolveLiveCredentialPrecedence, createSingleUserPromptMessage, extractNonEmptyAssistantText, logLiveProgress, completeSimpleWithTimeout } from "./live-test-helpers.js";
export { isLiveAuthDrift, isLiveBillingDrift, isLiveRateLimitDrift, isLiveProviderUnavailableDrift, shouldSkipLiveProviderDrift } from "./live-test-provider-drift.js";
export { resolveLocalModelLeanPreserveToolNames, isLocalModelLeanEnabled, filterLocalModelLeanTools, applyLocalModelLeanToolSearchDefaults } from "./local-model-lean.js";
export { markRestartAbortedMainSessions, markStartupOrphanedMainSessionsForRecovery, markRestartAbortedMainSessionsFromLocks, recoverRestartAbortedMainSessions, recoverStartupOrphanedMainSessions, scheduleRestartAbortedMainSessionRecovery } from "./main-session-restart-recovery.js";
export { buildMcpHttpFetch, withoutMcpAuthorizationHeader, withSameOriginMcpHttpHeaders } from "./mcp-http-fetch.js";
export type { McpOAuthCredentialsStatus } from "./mcp-oauth.js";
export { createMcpOAuthClientProvider, clearMcpOAuthCredentials, readMcpOAuthCredentialsStatus, runMcpOAuthLogin } from "./mcp-oauth.js";
export { OpenClawStdioClientTransport } from "./mcp-stdio-transport.js";
export { resolveMcpTransport } from "./mcp-transport.js";
export { buildMediaGenerationRequestKey, recordRecentMediaGenerationTaskStartForSession, findRecentStartedMediaGenerationTaskForSession, resetRecentMediaGenerationDuplicateGuardsForTests, findActiveMediaGenerationTaskForSession, listActiveMediaGenerationTasksForSession, findDuplicateGuardMediaGenerationTaskForSession, buildMediaGenerationTaskStatusDetails, buildMediaGenerationTaskStatusListDetails, buildMediaGenerationTaskStatusText, buildMediaGenerationTaskStatusListText, buildActiveMediaGenerationTaskPromptContextForSession } from "./media-generation-task-status-shared.js";
export type { ResolvedMemorySearchConfig, ResolvedMemorySearchSyncConfig } from "./memory-search.js";
export { resolveMemorySearchConfig, resolveMemorySearchSyncConfig } from "./memory-search.js";
export { ensureStaticModelAllowlistEntry } from "./model-allowlist-entry.js";
export { resolveProviderEnvAuthLookupMaps, listProviderEnvAuthLookupKeys, listKnownProviderEnvApiKeyNames } from "./model-auth-env-vars.js";
export type { EnvApiKeyResult, EnvApiKeyLookupOptions } from "./model-auth-env.js";
export { resolveEnvApiKey } from "./model-auth-env.js";
export { resolveModelAuthLabel } from "./model-auth-label.js";
export { MINIMAX_OAUTH_MARKER, OAUTH_API_KEY_MARKER_PREFIX, OLLAMA_LOCAL_AUTH_MARKER, CUSTOM_LOCAL_AUTH_MARKER, CODEX_APP_SERVER_AUTH_MARKER, GCP_VERTEX_CREDENTIALS_MARKER, NON_ENV_SECRETREF_MARKER, SECRETREF_ENV_HEADER_MARKER_PREFIX, listKnownNonSecretApiKeyMarkers, isAwsSdkAuthMarker, isKnownEnvApiKeyMarker, resolveOAuthApiKeyMarker, isOAuthApiKeyMarker, resolveNonEnvSecretRefApiKeyMarker, resolveNonEnvSecretRefHeaderValueMarker, resolveEnvSecretRefHeaderValueMarker, isSecretRefHeaderValueMarker, isNonSecretApiKeyMarker } from "./model-auth-markers.js";
export type { ResolvedProviderAuth } from "./model-auth-runtime-shared.js";
export { ProviderAuthError, MissingProviderAuthError, isProviderAuthError, isMissingProviderAuthError, resolveAwsSdkEnvVarName, formatMissingAuthError, requireApiKey } from "./model-auth-runtime-shared.js";
export type { ProviderCredentialPrecedence, RuntimeProviderAuthLookup, ProviderEntryApiKeyBindingResolution, ModelAuthMode } from "./model-auth.js";
export { createRuntimeProviderAuthLookup, getCustomProviderApiKey, resolveUsableCustomProviderApiKey, hasUsableCustomProviderApiKey, shouldPreferExplicitConfigApiKeyAuth, canUseProfileAsProviderEntryApiKey, resolveProviderEntryApiKeyProfileReference, resolveProviderEntryApiKeyBinding, hasSyntheticLocalProviderAuthConfig, hasRuntimeAvailableProviderAuth, resolveApiKeyForProvider, resolveModelAuthMode, hasAvailableAuthForProvider, getApiKeyForModel, applyLocalNoAuthHeaderOverride, applyAuthHeaderOverride } from "./model-auth.js";
export type { ModelCatalogBrowseView } from "./model-catalog-browse.js";
export { modelCatalogBrowseRequiresFullDiscovery, loadModelCatalogForBrowse } from "./model-catalog-browse.js";
export { modelSupportsInput, findModelInCatalog, findModelCatalogEntry } from "./model-catalog-lookup.js";
export { resolveModelCatalogScope, resolveProviderDiscoveryProviderIdsForCatalogScope } from "./model-catalog-scope.js";
export { buildAgentModelCatalogCacheKey, readCachedAgentModelCatalog, writeCachedAgentModelCatalog } from "./model-catalog-state-cache.js";
export { isCodexRoutableOpenAIPlatformCatalogEntry, resolveVisibleModelCatalog } from "./model-catalog-visibility.js";
export { loadManifestModelCatalog, loadModelCatalog } from "./model-catalog.runtime.js";
export type { ModelCatalogEntry, ModelInputType } from "./model-catalog.js";
export { resetModelCatalogCache, resetModelCatalogCacheForTest, setModelCatalogImportForTest, modelSupportsVision, modelSupportsDocument } from "./model-catalog.js";
export { resolveModelWorkspaceDir, resolveModelPluginMetadataSnapshot } from "./model-discovery-context.js";
export type { ModelFallbackStepFields, ModelFallbackDecisionParams } from "./model-fallback-observation.js";
export { isModelFallbackDecisionLogEnabled, resetModelFallbackDecisionLogCoalescingForTest, logModelFallbackDecision } from "./model-fallback-observation.js";
export type { ModelFallbackRunOptions, ModelFallbackResultClassification } from "./model-fallback.js";
export { probeThrottleInternals, FallbackSummaryError, isFallbackSummaryError, resolveImageFallbackCandidates, resolveImageFallbackDefaultProvider, resolveModelCandidateChain, runWithModelFallback, runWithImageModelFallback } from "./model-fallback.js";
export { isRetiredModelPickerProvider, createModelPickerVisibleProviderPredicate } from "./model-picker-visibility.js";
export type { PreparedProviderAuthState, ProviderAuthWarmSnapshot } from "./model-provider-auth-state.js";
export { getCurrentProviderAuthStates, claimCurrentProviderAuthStateGeneration, isCurrentProviderAuthStateGeneration, setCurrentProviderAuthWarmWorker, clearCurrentProviderAuthWarmWorker, cancelCurrentProviderAuthWarmWorker, clearCurrentProviderAuthState, publishProviderAuthWarmSnapshot } from "./model-provider-auth-state.js";
export { hasAuthForModelProvider, createProviderAuthChecker, buildCurrentProviderAuthStateSnapshot, warmCurrentProviderAuthStateOffMainThread } from "./model-provider-auth.js";
export { runProviderAuthWarmWorkerInput } from "./model-provider-auth.worker.js";
export { splitTrailingAuthProfile } from "./model-ref-profile.js";
export type { ProviderModelIdNormalizationOptions } from "./model-ref-shared.js";
export { normalizeStaticProviderModelId, normalizeConfiguredProviderCatalogModelId, resolveStaticAllowlistModelKey, formatLiteralProviderPrefixedModelRef, modelKey } from "./model-ref-shared.js";
export { loadAgentModelRegistry } from "./model-registry-loader.js";
export { isCliRuntimeProvider, isCliRuntimeAlias, isCliRuntimeAliasForProvider, areRuntimeModelRefsEquivalent, shouldPreferActiveRuntimeAliasAuthLabel, resolveCliRuntimeExecutionProvider } from "./model-runtime-aliases.js";
export { isCliProvider } from "./model-selection-cli.js";
export { resolveModelDisplayRef, resolveModelDisplayName, resolveSessionInfoModelSelection } from "./model-selection-display.js";
export type { ModelRef, ModelManifestNormalizationContext } from "./model-selection-normalize.js";
export { legacyModelKey, normalizeProviderId, normalizeProviderIdForAuth, findNormalizedProviderValue, findNormalizedProviderKey, normalizeModelRef, parseModelRef } from "./model-selection-normalize.js";
export type { ModelRefStatus } from "./model-selection-resolve.js";
export { getModelRefStatus, resolveAllowedModelRef, buildConfiguredAllowlistKeys, buildModelAliasIndex, normalizeModelSelection, resolveConfiguredModelRef, resolveHooksGmailModel, resolveModelRefFromString } from "./model-selection-resolve.js";
export type { ModelAliasIndex, ResolveAllowedModelRefResult, ModelVisibilityPolicy } from "./model-selection-shared.js";
export { inferUniqueProviderFromConfiguredModels, inferUniqueProviderFromCatalog, resolveBareModelDefaultProvider, resolveConfiguredOpenRouterCompatAlias, resolveAllowlistModelKey, buildAllowedModelSetWithFallbacks, getModelRefStatusWithFallbackModels, resolveAllowedModelRefFromAliasIndex, hasConfiguredProviderModelRows, buildConfiguredModelCatalog, parseConfiguredModelVisibilityEntries, providerWildcardModelKey, isModelKeyAllowedBySet, resolveAllowedModelSelection, dedupeModelCatalogEntries, createModelVisibilityPolicyWithFallbacks } from "./model-selection-shared.js";
export type { ThinkLevel } from "./model-selection.js";
export { resolvePersistedOverrideModelRef, resolvePersistedModelRef, resolvePersistedSelectedModelRef, normalizeStoredOverrideModel, resolveDefaultModelForAgent, canonicalizeCaseOnlyCatalogModelRef, resolveSubagentConfiguredModelSelection, resolveSubagentSpawnModelSelection, resolveConfiguredSubagentSpawnModelSelection, buildAllowedModelSet, resolveReasoningDefault } from "./model-selection.js";
export { shouldSuppressBuiltInModel, buildShouldSuppressBuiltInModel } from "./model-suppression.runtime.js";
export { clearModelSuppressionResolverCacheForTest, shouldSuppressBuiltInModelFromManifest, shouldUnconditionallySuppress, buildSuppressedBuiltInModelError } from "./model-suppression.js";
export { supportsModelTools } from "./model-tool-support.js";
export { resolveModelPayloadDebugMode, resolveModelSseDebugMode, emitModelTransportDebug } from "./model-transport-debug.js";
export { formatModelTransportDebugUrl, formatModelTransportDebugBaseUrl } from "./model-transport-url.js";
export { RUNTIME_MODEL_VISIBILITY_NORMALIZATION, createModelVisibilityPolicy } from "./model-visibility-policy.js";
export type { ModelsJsonReadyResult, ModelsJsonReadyState } from "./models-config-state.js";
export { MODELS_JSON_STATE, resetModelsJsonReadyCacheForTest } from "./models-config-state.js";
export type { ExistingProviderConfig } from "./models-config.merge.js";
export { mergeProviderModels, mergeProviders, mergeWithExistingProviderSecrets } from "./models-config.merge.js";
export type { ResolveImplicitProvidersForModelsJson } from "./models-config.plan.js";
export { resolveProvidersForModelsJsonWithDeps, planOpenClawModelsJsonWithDeps, planOpenClawModelsJson } from "./models-config.plan.js";
export { resolveProviderDiscoveryFilterForTest, resolvePluginMetadataProviderOwnersForTest, resolveImplicitProviders } from "./models-config.providers.implicit.js";
export { normalizeProviderCatalogModelsForConfig, normalizeProviders } from "./models-config.providers.normalize.js";
export { resolveProviderPluginLookupKey } from "./models-config.providers.policy.lookup.js";
export { applyProviderNativeStreamingUsagePolicy, normalizeProviderConfigPolicy, resolveProviderConfigApiKeyPolicy } from "./models-config.providers.policy.runtime.js";
export { applyNativeStreamingUsageCompat, normalizeProviderSpecificConfig, resolveProviderConfigApiKeyResolver } from "./models-config.providers.policy.js";
export type { ProviderConfig, SecretDefaults, ProviderApiKeyResolver, ProviderAuthResolver } from "./models-config.providers.secret-helpers.js";
export { normalizeApiKeyConfig, toDiscoveryApiKey, resolveEnvApiKeyVarName, resolveAwsSdkApiKeyVarName, normalizeHeaderValues, resolveApiKeyFromCredential, listAuthProfilesForProvider, resolveApiKeyFromProfiles, normalizeConfiguredProviderApiKey, normalizeResolvedEnvApiKey, resolveMissingProviderApiKey } from "./models-config.providers.secret-helpers.js";
export { createProviderApiKeyResolver, createProviderAuthResolver } from "./models-config.providers.secrets.js";
export { enforceSourceManagedProviderSecrets } from "./models-config.providers.source-managed.js";
export { ensureOpenClawModelsJson } from "./models-config.runtime.js";
export type { PreparedOpenClawModelsJsonSource } from "./models-config.js";
export { ensureModelsFileModeForModelsJson, writeModelsFileAtomicForModelsJson, buildModelsJsonSourceFingerprint, prepareOpenClawModelsJsonSource } from "./models-config.js";
export { MUSIC_GENERATION_TASK_KIND, findActiveMusicGenerationTaskForSession, findDuplicateGuardMusicGenerationTaskForSession, buildMusicGenerationTaskStatusDetails, buildMusicGenerationTaskStatusText, buildActiveMusicGenerationTaskPromptContextForSession } from "./music-generation-task-status.js";
export { resolveAzureOpenAIApiVersion, createOpenAIResponsesTransportStreamFn, buildOpenAIResponsesParams, createAzureOpenAIResponsesTransportStreamFn, createOpenAICompletionsTransportStreamFn, buildOpenAICompletionsParams, parseTransportChunkUsage, sanitizeTransportPayloadText } from "./openai-transport-stream.js";
export { resolveOpenClawPluginToolsForOptions } from "./openclaw-plugin-tools.js";
export { isToolExplicitlyAllowedByFactoryPolicy, mergeFactoryPolicyList, resolveImageToolFactoryAvailable, resolveOptionalMediaToolFactoryPlan } from "./openclaw-tools.media-factory-plan.js";
export { applyNodesToolWorkspaceGuard } from "./openclaw-tools.nodes-workspace-guard.js";
export type { OpenClawPluginToolOptions } from "./openclaw-tools.plugin-context.js";
export { resolveOpenClawPluginToolInputs } from "./openclaw-tools.plugin-context.js";
export { collectPresentOpenClawTools, shouldIncludeUpdatePlanToolForOpenClawTools } from "./openclaw-tools.registration.js";
export { createOpenClawTools } from "./openclaw-tools.runtime.js";
export type { PluginModelCatalogMetadataSnapshot } from "./plugin-model-catalog.js";
export { PLUGIN_MODEL_CATALOG_FILE, PLUGIN_MODEL_CATALOG_GENERATED_BY, encodePluginModelCatalogRelativePath, isPluginModelCatalogRelativePath, decodePluginModelCatalogRelativePathPluginId, listPluginModelCatalogRelativePaths, listPluginModelCatalogFiles, isGeneratedPluginModelCatalog, resolvePluginModelCatalogOwnerPluginId, filterGeneratedPluginModelCatalogProviders } from "./plugin-model-catalog.js";
export { mergePluginTextTransforms, applyPluginTextReplacements, wrapStreamFnTextTransforms } from "./plugin-text-transforms.js";
export { applyPluginToolDeliveryDefaults } from "./plugin-tool-delivery-defaults.js";
export type { ProviderAttributionPolicy, ProviderRequestTransport, ProviderRequestCapability, ProviderEndpointClass, ProviderEndpointResolution, ProviderRequestPolicyInput, ProviderRequestPolicyResolution, ProviderRequestCapabilitiesInput, ProviderRequestCompatibilityFamily, ProviderRequestCapabilities } from "./provider-attribution.js";
export { resolveProviderEndpoint, resolveProviderAttributionIdentity, listProviderAttributionPolicies, resolveProviderAttributionPolicy, resolveProviderRequestPolicy, resolveProviderRequestCapabilities, describeProviderRequestRoutingSummary } from "./provider-attribution.js";
export type { ProviderAuthAliasLookupParams } from "./provider-auth-aliases.js";
export { resetProviderAuthAliasMapCacheForTest, resolveProviderAuthAliasMap, resolveProviderIdForAuth } from "./provider-auth-aliases.js";
export { buildProviderAuthRecoveryHint } from "./provider-auth-recovery-hint.js";
export { ProviderHttpError, asObject, truncateErrorDetail, readResponseTextLimited, formatProviderErrorPayload, extractProviderErrorDetail, extractProviderRequestId, formatProviderHttpErrorMessage, createProviderHttpError, assertOkOrThrowProviderError, assertOkOrThrowHttpError, readProviderJsonResponse, readProviderJsonObjectResponse, readProviderJsonArrayFieldResponse, assertProviderBinaryResponseContent, readProviderBinaryResponse } from "./provider-http-errors.js";
export type { ProviderLocalServiceLease } from "./provider-local-service.js";
export { attachModelProviderLocalService, getModelProviderLocalService, ensureModelProviderLocalService, stopManagedProviderLocalServicesForTest, hasLocalServiceProcessExited } from "./provider-local-service.js";
export { normalizeProviderModelIdWithRuntime } from "./provider-model-normalization.runtime.js";
export type { ProviderRequestAuthOverride, ProviderRequestTlsOverride, ProviderRequestProxyOverride, ProviderRequestTransportOverrides, ModelProviderRequestTransportOverrides, ResolvedProviderRequestConfig } from "./provider-request-config.js";
export { sanitizeConfiguredProviderRequest, sanitizeConfiguredModelProviderRequest, mergeProviderRequestOverrides, mergeModelProviderRequestOverrides, normalizeBaseUrl, sanitizeRuntimeProviderRequestOverrides, applyPreparedRuntimeAuthToModel, buildProviderRequestDispatcherPolicy, resolveProviderRequestPolicyConfig, resolveProviderRequestConfig, resolveProviderRequestHeaders, attachModelProviderRequestTransport, getModelProviderRequestTransport } from "./provider-request-config.js";
export { registerProviderStreamForModel } from "./provider-stream.js";
export { normalizeToolProviderPolicyKey, isCanonicalToolProviderPolicyKey, resolveProviderToolPolicyEntry, resolveProviderToolPolicy } from "./provider-tool-policy.js";
export { resolveModelRequestTimeoutMs, buildGuardedModelFetch } from "./provider-transport-fetch.js";
export { isTransportAwareApiSupported, resolveTransportAwareSimpleApi, createTransportAwareStreamFnForModel, createOpenClawTransportStreamFnForModel, createBoundaryAwareStreamFnForModel, prepareTransportAwareSimpleModel, buildTransportAwareSimpleStreamFn } from "./provider-transport-stream.js";
export type { RealtimeBootstrapContextFileName } from "./realtime-bootstrap-context.js";
export { REALTIME_BOOTSTRAP_CONTEXT_FILE_NAMES, resolveRealtimeBootstrapContextInstructions } from "./realtime-bootstrap-context.js";
export { hasOnlyAssistantReasoningContent, isReasoningOnlyLengthAssistantTurn } from "./replay-turn-classification.js";
export { sanitizeResponsesImagePayload } from "./responses-image-payload-sanitizer.js";
export type { AgentRunSessionTarget, ResolvedAgentRunSessionTarget } from "./run-session-target.js";
export { resolveAgentRunSessionTarget, applyAgentRunSessionTargetIdentity } from "./run-session-target.js";
export { clampRuntimeAuthRefreshDelayMs } from "./runtime-auth-refresh.js";
export { collectRuntimeChannelCapabilities } from "./runtime-capabilities.js";
export { ensureRuntimePluginsLoaded } from "./runtime-plugins.js";
export type { SandboxedBridgeMediaPathConfig } from "./sandbox-media-paths.js";
export { createSandboxBridgeReadFile, resolveSandboxedBridgeMediaPath } from "./sandbox-media-paths.js";
export { resolveSandboxInputPath, resolveSandboxPath, assertSandboxPath, assertMediaNotDataUrl, resolveAllowedManagedMediaPath, resolveSandboxedMediaSource } from "./sandbox-paths.js";
export { SELF_HOSTED_DEFAULT_CONTEXT_WINDOW, SELF_HOSTED_DEFAULT_MAX_TOKENS, SELF_HOSTED_DEFAULT_COST } from "./self-hosted-provider-defaults.js";
export { resolveSenderToolPolicy } from "./sender-tool-policy.js";
export { resolveBoundAgentIdForSession } from "./session-agent-binding.js";
export { getRawSessionAppendMessage, setRawSessionAppendMessage } from "./session-raw-append-message.js";
export { resolvePersistedSessionRuntimeId } from "./session-runtime-compat.js";
export type { SessionSuspensionReason, SessionSuspensionTarget, SessionSuspensionParams } from "./session-suspension.js";
export { DEFAULT_QUOTA_SUSPENSION_RESUME_MS, resolveSessionSuspensionReason, runWithDeferredSessionSuspension, resolveSessionSuspensionTarget, suspendSession } from "./session-suspension.js";
export { guardSessionManager } from "./session-tool-result-guard-wrapper.js";
export { installSessionToolResultGuard } from "./session-tool-result-guard.js";
export { stripToolResultDetails, sanitizeToolCallInputs, sanitizeToolUseResultPairing, repairToolUseResultPairing } from "./session-transcript-repair.js";
export { SessionWriteLockTimeoutError, SessionWriteLockStaleError, isSessionWriteLockAcquireError } from "./session-write-lock-error.js";
export { maybeWrapCommandWithShellSnapshot, resetShellSnapshotCacheForTests, resolveShellSnapshotDir } from "./shell-snapshot.js";
export type { SimpleCompletionModelOptions, PreparedSimpleCompletionModel, AgentSimpleCompletionSelection, PreparedSimpleCompletionModelForAgent } from "./simple-completion-runtime.js";
export { resolveSimpleCompletionSelectionForAgent, prepareSimpleCompletionModel, prepareSimpleCompletionModelForAgent, completeWithPreparedSimpleCompletionModel } from "./simple-completion-runtime.js";
export { prepareModelForSimpleCompletion } from "./simple-completion-transport.js";
export { resolveRequesterOriginForChild } from "./spawn-requester-origin.js";
export type { SpawnedRunMetadata, SpawnedToolContext } from "./spawned-context.js";
export { normalizeSpawnedRunMetadata, mapToolContextToSpawnedRunMetadata, resolveSpawnedWorkspaceInheritance, resolveIngressWorkspaceOverrideForSpawnedRun } from "./spawned-context.js";
export { buildActiveSubagentSystemPromptAddition } from "./subagent-active-context.js";
export { readLatestSubagentOutputWithRetryUsing, captureSubagentCompletionReplyUsing } from "./subagent-announce-capture.js";
export { callGateway, dispatchGatewayMethodInProcess } from "./subagent-announce-delivery.runtime.js";
export { resolveSubagentAnnounceTimeoutMs, isInternalAnnounceRequesterSession, runAnnounceDeliveryWithRetry, resolveSubagentCompletionOrigin, loadRequesterSessionEntry, loadSessionEntryByKey, deliverSubagentAnnouncement } from "./subagent-announce-delivery.js";
export type { SubagentAnnounceDeliveryFailureReason, SubagentAnnounceDeliveryResult } from "./subagent-announce-dispatch.js";
export { mapSteerOutcomeToDeliveryResult, runSubagentAnnounceDispatch } from "./subagent-announce-dispatch.js";
export { resolveAnnounceOrigin } from "./subagent-announce-origin.js";
export type { SubagentRunOutcome } from "./subagent-announce-output.js";
export { withSubagentOutcomeTiming, readSubagentOutput, readLatestSubagentOutputWithRetry, waitForSubagentRunOutcome, applySubagentWaitOutcome, captureSubagentCompletionReply, buildChildCompletionFindings, dedupeLatestChildCompletionRows, filterCurrentDirectChildCompletionRows, buildCompactAnnounceStatsLine } from "./subagent-announce-output.js";
export { countActiveDescendantRuns, countPendingDescendantRuns, countPendingDescendantRunsExcludingRun, getLatestSubagentRunByChildSessionKey, isSubagentSessionRunActive, listSubagentRunsForRequester, replaceSubagentRunAfterSteer, resolveRequesterForChildSession, shouldIgnorePostCompletionAnnounceForSession } from "./subagent-announce.registry.runtime.js";
export type { SubagentAnnounceType } from "./subagent-announce.js";
export { runSubagentAnnounceFlow, buildSubagentSystemPrompt } from "./subagent-announce.js";
export type { SubagentInlineAttachment, SubagentAttachmentReceiptFile } from "./subagent-attachments.js";
export { decodeStrictBase64, resolveAcpSessionsSpawnImageAttachments, materializeSubagentAttachments } from "./subagent-attachments.js";
export type { SubagentSessionRole, SessionCapabilityStore } from "./subagent-capabilities.js";
export { resolveSubagentCapabilityStore, resolveSubagentCapabilities, isSubagentEnvelopeSession, resolveStoredSubagentCapabilities, resolveStoredSubagentInheritedToolDenylist, resolveStoredSubagentInheritedToolAllowlist } from "./subagent-capabilities.js";
export type { ResolvedSubagentController } from "./subagent-control.js";
export { DEFAULT_RECENT_MINUTES, MAX_RECENT_MINUTES, resolveSubagentController, listControlledSubagentRuns, killAllControlledSubagentRuns, killControlledSubagentRun, killSubagentRunAdmin, steerControlledSubagentRun, sendControlledSubagentMessage } from "./subagent-control.js";
export type { LegacySubagentRunRecord } from "./subagent-delivery-state.js";
export { normalizeSubagentRunState, ensureCompletionState, ensureDeliveryState, clearDeliveryState, isDeliverySuspended, getDeliveryAttemptCount, getDeliveryLastAttemptAt, getDeliveryLastError } from "./subagent-delivery-state.js";
export { getSubagentDepthFromSessionStore } from "./subagent-depth.js";
export { buildSubagentInitialUserMessage } from "./subagent-initial-user-message.js";
export type { SubagentLifecycleEndedReason, SubagentLifecycleEndedOutcome } from "./subagent-lifecycle-events.js";
export { SUBAGENT_TARGET_KIND_SUBAGENT, SUBAGENT_ENDED_REASON_COMPLETE, SUBAGENT_ENDED_REASON_ERROR, SUBAGENT_ENDED_REASON_KILLED, SUBAGENT_ENDED_OUTCOME_OK, SUBAGENT_ENDED_OUTCOME_ERROR, SUBAGENT_ENDED_OUTCOME_TIMEOUT, SUBAGENT_ENDED_OUTCOME_KILLED } from "./subagent-lifecycle-events.js";
export { resolveSessionEntryForKey, buildLatestSubagentRunIndex, buildSubagentList } from "./subagent-list.js";
export { recoverOrphanedSubagentSessions, scheduleOrphanRecovery } from "./subagent-orphan-recovery.js";
export { isSubagentRecoveryWedgedEntry, formatSubagentRecoveryWedgedReason, evaluateSubagentRecoveryGate, markSubagentRecoveryAttempt, markSubagentRecoveryWedged, clearWedgedSubagentRecoveryAbort } from "./subagent-recovery-state.js";
export { resolveCleanupCompletionReason, resolveDeferredCleanupDecision } from "./subagent-registry-cleanup.js";
export { shouldUpdateRunOutcome, resolveLifecycleOutcomeFromRunOutcome, emitSubagentEndedHookOnce } from "./subagent-registry-completion.js";
export { MIN_ANNOUNCE_RETRY_DELAY_MS, MAX_ANNOUNCE_RETRY_COUNT, ANNOUNCE_EXPIRY_MS, ANNOUNCE_COMPLETION_HARD_EXPIRY_MS, capFrozenResultText, resolveAnnounceRetryDelayMs, logAnnounceGiveUp, persistSubagentSessionTiming, safeRemoveAttachmentsDir, reconcileOrphanedRun, reconcileOrphanedRestoredRuns, resolveArchiveAfterMs, getSubagentSessionRuntimeMs, getSubagentSessionStartedAt, resolveSubagentSessionStatus } from "./subagent-registry-helpers.js";
export { createSubagentRegistryLifecycleController } from "./subagent-registry-lifecycle.js";
export { listSessionMaintenanceProtectedSubagentSessionKeys } from "./subagent-registry-maintenance.js";
export { subagentRuns } from "./subagent-registry-memory.js";
export type { SubagentRunReadIndex } from "./subagent-registry-queries.js";
export { listRunsForRequesterFromRuns, listRunsForControllerFromRuns, buildSubagentRunReadIndexFromRuns, isSubagentSessionRunActiveFromRuns, getSubagentRunByChildSessionKeyFromRuns, resolveRequesterForChildSessionFromRuns, shouldIgnorePostCompletionAnnounceForSessionFromRuns, countActiveRunsForSessionFromRuns, countActiveDescendantRunsFromRuns, countPendingDescendantRunsFromRuns, countPendingDescendantRunsExcludingRunFromRuns, listDescendantRunsForRequesterFromRuns } from "./subagent-registry-queries.js";
export { buildSubagentRunReadIndex, listSubagentRunsForController, listDescendantRunsForRequester, getSubagentRunByChildSessionKey, isSubagentRunLive, getSessionDisplaySubagentRunByChildSessionKey } from "./subagent-registry-read.js";
export type { RegisterSubagentRunParams } from "./subagent-registry-run-manager.js";
export { markSubagentRunPausedAfterYield, createSubagentRunManager } from "./subagent-registry-run-manager.js";
export { clearSubagentRunsReadCacheForTest, persistSubagentRunsToDisk, persistSubagentRunsToDiskOrThrow, restoreSubagentRunsFromDisk, getSubagentRunsSnapshotForRead } from "./subagent-registry-state.js";
export { configureSubagentRegistrySteerRuntime, finalizeInterruptedSubagentRun } from "./subagent-registry-steer-runtime.js";
export { loadSubagentRegistryFromSqlite, saveSubagentRegistryToSqlite } from "./subagent-registry.store.sqlite.js";
export { resolveSubagentRegistryPath, loadSubagentRegistryFromDisk, saveSubagentRegistryToDisk } from "./subagent-registry.store.js";
export type { SubagentRunRecord } from "./subagent-registry.js";
export { scheduleSubagentOrphanRecovery, markSubagentRunForSteerRestart, clearSubagentRunSteerRestart, registerSubagentRun, resetSubagentRegistryForTests, addSubagentRunForTests, releaseSubagentRun, markSubagentRunTerminated, leasePendingAgentSteeringItems, ackPendingAgentSteeringItems, releasePendingAgentSteeringItems, countActiveRunsForSession, initSubagentRegistry } from "./subagent-registry.js";
export type { PendingFinalDeliveryPayload, SubagentExecutionState, SubagentCompletionState, SubagentCompletionDeliveryState } from "./subagent-registry.types.js";
export { resolveRequesterStoreKey } from "./subagent-requester-store-key.js";
export { RECENT_ENDED_SUBAGENT_CHILD_SESSION_MS, hasSubagentRunEnded, isStaleUnendedSubagentRun, isLiveUnendedSubagentRun, shouldKeepSubagentRunChildLink } from "./subagent-run-liveness.js";
export { resolveSubagentRunTimerDelayMs, resolveSubagentRunDurationMs, resolveSubagentRunDeadlineMs } from "./subagent-run-timeout.js";
export { deleteSubagentSessionForCleanup } from "./subagent-session-cleanup.js";
export type { SubagentSessionStoreCache, SubagentRunOrphanReason, SubagentSessionCompletion } from "./subagent-session-reconciliation.js";
export { loadSubagentSessionEntry, resolveSubagentRunOrphanReason, resolveCompletionFromSessionEntry, resolveSubagentSessionCompletion, resolveSubagentSessionStartedAt } from "./subagent-session-reconciliation.js";
export { SUBAGENT_SPAWN_ACCEPTED_NOTE, SUBAGENT_SPAWN_SESSION_ACCEPTED_NOTE, resolveSubagentSpawnAcceptedNote } from "./subagent-spawn-accepted-note.js";
export type { SubagentSpawnOwnership } from "./subagent-spawn-ownership.js";
export { resolveSubagentSpawnOwnership } from "./subagent-spawn-ownership.js";
export { splitModelRef, resolveConfiguredSubagentRunTimeoutSeconds, resolveSubagentModelAndThinkingPlan } from "./subagent-spawn-plan.js";
export { resolveSubagentThinkingOverride } from "./subagent-spawn-thinking.js";
export { DEFAULT_SUBAGENT_MAX_CHILDREN_PER_AGENT, DEFAULT_SUBAGENT_MAX_SPAWN_DEPTH, hasInProcessGatewayContext, isAdminOnlyMethod, resolveGatewaySessionStoreTarget, emitSessionLifecycleEvent } from "./subagent-spawn.runtime.js";
export type { SpawnSubagentParams, SpawnSubagentContext, SpawnSubagentResult, SpawnSubagentContextMode, SpawnSubagentMode, SpawnSubagentSandboxMode } from "./subagent-spawn.js";
export { spawnSubagentDirect, SUBAGENT_SPAWN_CONTEXT_MODES, SUBAGENT_SPAWN_MODES, SUBAGENT_SPAWN_SANDBOX_MODES } from "./subagent-spawn.js";
export { resolveSubagentAllowedTargetIds, resolveSubagentTargetPolicy } from "./subagent-target-policy.js";
export { normalizeSubagentTaskName } from "./subagent-task-name.js";
export { assistantCallsSessionsYield, isSessionsYieldToolResult } from "./subagent-yield-output.js";
export { SYSTEM_PROMPT_CACHE_BOUNDARY, stripSystemPromptCacheBoundary, ensureSystemPromptCacheBoundary, splitSystemPromptCacheBoundary, prependSystemPromptAdditionAfterCacheBoundary } from "./system-prompt-cache-boundary.js";
export { resolveAgentSystemPromptConfig, buildConfiguredAgentSystemPrompt } from "./system-prompt-config.js";
export { buildSystemPromptParams } from "./system-prompt-params.js";
export { buildSystemPromptReport } from "./system-prompt-report.js";
export { buildAgentBootstrapSystemContext, buildAgentBootstrapSystemPromptSections, buildModelIdentityPromptLine, appendModelIdentitySystemPrompt, buildAgentSystemPrompt, buildRuntimeLine } from "./system-prompt.js";
export { collectExplicitToolAllowlistSources, buildEmptyExplicitToolAllowlistError } from "./tool-allowlist-guard.js";
export { normalizeAllowedToolNames, isAllowedToolCallName } from "./tool-call-shared.js";
export { EXEC_TOOL_DISPLAY_SUMMARY, PROCESS_TOOL_DISPLAY_SUMMARY, CRON_TOOL_DISPLAY_SUMMARY, SESSIONS_LIST_TOOL_DISPLAY_SUMMARY, SESSIONS_HISTORY_TOOL_DISPLAY_SUMMARY, SESSIONS_SEND_TOOL_DISPLAY_SUMMARY, SESSIONS_SPAWN_TOOL_DISPLAY_SUMMARY, SESSIONS_SPAWN_SUBAGENT_TOOL_DISPLAY_SUMMARY, SESSION_STATUS_TOOL_DISPLAY_SUMMARY, UPDATE_PLAN_TOOL_DISPLAY_SUMMARY, describeSessionsListTool, describeSessionsHistoryTool, describeSessionsSendTool, describeSessionsSpawnTool, describeSessionStatusTool, describeUpdatePlanTool } from "./tool-description-presets.js";
export { summarizeToolDescriptionText, describeToolForVerbose } from "./tool-description-summary.js";
export { TOOL_DISPLAY_CONFIG } from "./tool-display-config.js";
export { stripOuterQuotes, splitShellWords, binaryName, optionValue, positionalArgs, firstPositional, trimLeadingEnv, unwrapShellWrapper, splitTopLevelStages, splitTopLevelPipes, stripShellPreamble } from "./tool-display-exec-shell.js";
export type { ToolDetailMode } from "./tool-display-exec.js";
export { resolveExecDetail } from "./tool-display-exec.js";
export type { ToolFsPolicy } from "./tool-fs-policy.js";
export { createToolFsPolicy, resolveToolFsConfig, resolveEffectiveToolFsWorkspaceOnly, resolveEffectiveToolFsRootExpansionAllowed } from "./tool-fs-policy.js";
export { TOOL_CALL_HISTORY_SIZE, WARNING_THRESHOLD, UNKNOWN_TOOL_THRESHOLD, CRITICAL_THRESHOLD, GLOBAL_CIRCUIT_BREAKER_THRESHOLD, hashToolCall, detectToolCallLoop, recordToolCall, recordToolCallOutcome } from "./tool-loop-detection.js";
export { isLikelyMutatingToolName, isMutatingToolCall, isReplaySafeToolCall, buildToolMutationState, isSameToolMutationAction } from "./tool-mutation.js";
export type { ToolPolicyAuditLogLevel } from "./tool-policy-audit.js";
export { auditToolPolicyFilter, auditSandboxToolPolicyBlock } from "./tool-policy-audit.js";
export { buildDeclaredToolAllowlistContext } from "./tool-policy-declared-context.js";
export { TOOL_GROUPS, normalizeToolName, couldNormalizeToolNamePrefixToAllowedTool, normalizeToolList, expandToolGroups, resolveToolProfilePolicy } from "./tool-policy-shared.js";
export { isAgentToolReplaySafe, collectReplaySafeToolNames, isCoreToolNameReplaySafe } from "./tool-replay-safety.js";
export type { RuntimeToolSchemaDiagnostic } from "./tool-schema-projection.js";
export { inspectRuntimeToolInputSchemas, filterRuntimeCompatibleTools, filterProviderNormalizableTools } from "./tool-schema-projection.js";
export type { RuntimeToolSchemaQuarantineIdentity } from "./tool-schema-quarantine-health.js";
export { recordPersistedRuntimeToolSchemaQuarantine, clearRecoveredPersistedRuntimeToolSchemaQuarantines, listPersistedRuntimeToolSchemaQuarantines } from "./tool-schema-quarantine-health.js";
export { logRuntimeToolSchemaQuarantine } from "./tool-schema-quarantine.js";
export { setToolTerminalPresentation, getToolTerminalPresentation, copyToolTerminalPresentation } from "./tool-terminal-presentation.js";
export { buildEffectiveToolInventoryEntries, buildRuntimeCompatibleToolInventory } from "./tools-effective-inventory-build.js";
export { buildEffectiveToolInventoryGroups } from "./tools-effective-inventory-groups.js";
export { resolveEffectiveToolLabel, resolveEffectiveToolRawDescription, summarizeEffectiveToolDescription, disambiguateEffectiveToolLabels } from "./tools-effective-inventory-shared.js";
export { resolveEffectiveToolInventoryRuntimeModelContext, resolveEffectiveToolInventory } from "./tools-effective-inventory.js";
export type { EffectiveToolSource, EffectiveToolInventoryEntry, EffectiveToolInventoryGroup, EffectiveToolInventoryNotice, EffectiveToolInventoryResult, ResolveEffectiveToolInventoryParams } from "./tools-effective-inventory.types.js";
export { buildRuntimeCompatibleMcpToolInventory } from "./tools-effective-mcp-inventory.js";
export type { TranscriptPolicy } from "./transcript-policy.js";
export { providerRequiresSignedThinking, shouldAllowProviderOwnedThinkingReplay, resolveTranscriptPolicy } from "./transcript-policy.js";
export { redactTranscriptMessage } from "./transcript-redact.js";
export { transformTransportMessages } from "./transport-message-transform.js";
export type { WritableTransportStream } from "./transport-stream-shared.js";
export { sanitizeNonEmptyTransportPayloadText, coerceTransportToolCallArguments, mergeTransportHeaders, mergeTransportMetadata, createEmptyTransportUsage, createWritableTransportEventStream, finalizeTransportStream, assignTransportErrorDetails, failTransportStream } from "./transport-stream-shared.js";
export { VIDEO_GENERATION_TASK_KIND, findActiveVideoGenerationTaskForSession, findDuplicateGuardVideoGenerationTaskForSession, buildVideoGenerationTaskStatusDetails, buildVideoGenerationTaskStatusText, buildActiveVideoGenerationTaskPromptContextForSession } from "./video-generation-task-status.js";
export type { WebSearchToolPolicyParams } from "./web-search-tool-policy.js";
export { resolveWebSearchToolPolicy } from "./web-search-tool-policy.js";
export { normalizeWorkspaceDir, resolveWorkspaceRoot } from "./workspace-dir.js";
export { redactRunIdentifier, resolveRunWorkspaceDir } from "./workspace-run.js";

// ============================================================================
// 降级 stub 文件批量导出（移植自 openclaw agents 子系统剩余文件）
// 这些模块为重度降级 stub：类型降级为 unknown，函数体抛出 "not implemented"。
// ============================================================================
export * from "./abort.js";
export * from "./abortable.js";
export * from "./agent-bundle-mcp-test-harness.js";
export * from "./agent-end-side-effects.js";
export * from "./agent-message-fixtures.js";
export * from "./agent-session-runtime.js";
export * from "./agent-session-services.js";
export * from "./agent-session-token-mock.js";
export * from "./agent-session.js";
export * from "./agent-step.js";
export * from "./agent-tool-stubs.js";
export * from "./agent-tools-fs-helpers.js";
export * from "./agent-tools-sandbox-context.js";
export * from "./agents-list-tool.js";
export * from "./assistant-failover.js";
export * from "./assistant-message-fixtures.js";
export * from "./attempt-abort.js";
export * from "./attempt-bootstrap-routing.js";
export * from "./attempt-callbacks.js";
export * from "./attempt-execution.helpers.js";
export * from "./attempt-execution.runtime.js";
export * from "./attempt-execution.shared.js";
export * from "./attempt-execution.js";
export * from "./attempt-http-runtime.js";
export * from "./attempt-session.js";
export * from "./attempt-stage-timing.js";
export * from "./attempt-system-prompt.js";
export * from "./attempt-tool-construction-plan.js";
export * from "./attempt-trajectory-flush-cleanup.js";
export * from "./attempt-trajectory-status.js";
export * from "./attempt.abort-settle-timeout.js";
export * from "./attempt.async-tasks.js";
export * from "./attempt.bootstrap-context.js";
export * from "./attempt.context-engine-helpers.js";
export * from "./attempt.llm-boundary.js";
export * from "./attempt.model-diagnostic-events.js";
export * from "./attempt.prompt-helpers.js";
export * from "./attempt.queue-message.js";
export * from "./attempt.run-decisions.js";
export * from "./attempt.session-lock.js";
export * from "./attempt.sessions-yield.js";
export * from "./attempt.stop-reason-recovery.js";
export * from "./attempt.subscription-cleanup.js";
export * from "./attempt.thread-helpers.js";
export * from "./attempt.tool-call-argument-repair.js";
export * from "./attempt.tool-call-block-type.js";
export * from "./attempt.tool-call-normalization.js";
export * from "./attempt.tool-run-context.js";
export * from "./attempt.tool-search-run-plan.js";
export * from "./attempt.transcript-policy.js";
export * from "./attempt.js";
export * from "./auth-controller.js";
export * from "./auth-guidance.js";
export * from "./auth-profile-failure-policy.js";
export * from "./auth-storage.js";
export * from "./auth.js";
export * from "./backend.js";
export * from "./backend.types.js";
export * from "./bash-executor.js";
export * from "./bash-operations.js";
export * from "./bash.js";
export * from "./bootstrap.js";
export * from "./branch-summarization.js";
export * from "./browser-bridges.js";
export * from "./browser.js";
export * from "./build.js";
export * from "./builtin-openclaw.js";
export * from "./bundle-mcp-adapter-shared.js";
export * from "./bundle-mcp-claude.js";
export * from "./bundle-mcp-codex.js";
export * from "./bundle-mcp-gemini.js";
export * from "./bundle-mcp-shared.test-harness.js";
export * from "./bundle-mcp.test-harness.js";
export * from "./bundle-mcp.js";
export * from "./cache-ttl.js";
// CONFLICT: export * from "./chat-history-text.js";
export * from "./child-process.js";
export * from "./claude-api-error-fixture.js";
export * from "./claude-cli-project-dir.js";
export * from "./claude-live-session.js";
export * from "./claude-skills-plugin.js";
export * from "./clean-for-gemini.js";
export * from "./cli-compaction.js";
export * from "./clone.js";
export * from "./codex-app-server-extensions.js";
export * from "./codex-app-server-recovery.js";
export * from "./compact-reasons.js";
// CONFLICT: export * from "./compact.hooks.harness.js";
export * from "./compact.queued.js";
export * from "./compact.runtime.js";
export * from "./compact.runtime.types.js";
// CONFLICT: export * from "./compact.js";
export * from "./compact.types.js";
export * from "./compaction-duplicate-user-messages.js";
export * from "./compaction-hooks.js";
export * from "./compaction-instructions.js";
export * from "./compaction-recovery.js";
export * from "./compaction-retry-aggregate-timeout.js";
export * from "./compaction-runtime-context.js";
export * from "./compaction-safeguard-quality.js";
export * from "./compaction-safeguard-runtime.js";
export * from "./compaction-safeguard.js";
export * from "./compaction-safety-timeout.js";
export * from "./compaction-successor-transcript.js";
export * from "./compaction-timeout.js";
export * from "./config-hash.js";
export * from "./constants.js";
export * from "./context-engine-capabilities.js";
export * from "./context-engine-lifecycle.js";
export * from "./context-engine-maintenance.js";
export * from "./context-pruning.js";
export * from "./context-truncation-notice.js";
export * from "./credential-normalize.js";
export * from "./credential-state.js";
export * from "./cron-tool-canonicalize.js";
export * from "./cron-tool.js";
export * from "./delivery-evidence.js";
export * from "./delivery.runtime.js";
export * from "./delivery.js";
export * from "./diagnostics.js";
export * from "./diff.js";
export * from "./display.js";
export * from "./docker-backend.js";
export * from "./docker.js";
export * from "./doctor.js";
export * from "./edit-diff.js";
export * from "./edit.js";
export * from "./effective-oauth.js";
export * from "./effective-tool-policy.js";
export * from "./embedded-agent-runner-e2e-fixtures.js";
export * from "./embedded-agent-runner-e2e-mocks.js";
export * from "./embedded-agent-runner.sanitize-session-history.test-harness.js";
export * from "./embedded-agent-subscribe.compaction-test-helpers.js";
export * from "./embedded-agent-subscribe.e2e-harness.js";
export * from "./embedded-gateway-stub.runtime.js";
export * from "./embedded-gateway-stub.js";
export * from "./empty-assistant-turn.js";
export * from "./errors.js";
export * from "./event-bus.js";
export * from "./exec.js";
export * from "./execute.runtime.js";
export * from "./execute.js";
export * from "./execution-phase.js";
export * from "./extension-sdk.js";
export * from "./extension.js";
export * from "./extensions.js";
export * from "./external-auth.js";
export * from "./external-cli-auth-selection.js";
export * from "./external-cli-discovery.js";
export * from "./external-cli-scope.js";
export * from "./external-cli-sync.js";
export * from "./extra-params.js";
export * from "./failover-matches.js";
export * from "./failover-observation.js";
export * from "./failure-copy.js";
export * from "./failure-hook.js";
export * from "./failure-signal.js";
export * from "./fallbacks.js";
export * from "./fast-bash-tools.js";
export * from "./fast-coding-tools.js";
export * from "./fast-openclaw-tools-sessions.js";
export * from "./fast-openclaw-tools.js";
export * from "./fast-tool-stubs.js";
export * from "./file-mutation-queue.js";
export * from "./find.js";
export * from "./footer-data-provider.js";
export * from "./frontmatter.js";
export * from "./fs-bridge-mutation-helper.js";
export * from "./fs-bridge-path-safety.runtime.js";
export * from "./fs-bridge-path-safety.js";
export * from "./fs-bridge-shell-command-plans.js";
export * from "./fs-bridge-stat-parse.js";
export * from "./fs-bridge.js";
export * from "./fs-paths.js";
export * from "./fs-watch.js";
export * from "./gateway-schema.js";
export * from "./gateway-tool.js";
export * from "./gateway.js";
export * from "./goal-tools.js";
export * from "./google-prompt-cache.js";
export * from "./google.js";
export * from "./grep.js";
export * from "./heartbeat-response-tool.js";
export * from "./helpers.js";
export * from "./history-image-prune.js";
export * from "./history.js";
export * from "./hook-context.js";
export * from "./hook-helpers.js";
export * from "./hook-history.js";
export * from "./host-sandbox-fs-bridge.js";
export * from "./http-dispatcher.js";
export * from "./idle-timeout-breaker.js";
export * from "./image-generate-background.js";
export * from "./image-generate-tool.actions.js";
export * from "./image-generate-tool.js";
export * from "./image-resize.js";
export * from "./image-tool.helpers.js";
export * from "./image-tool.js";
export * from "./images.js";
export * from "./incomplete-turn.js";
export * from "./keybinding-hints.js";
export * from "./keybindings.js";
export * from "./lifecycle-hook-helpers.js";
export * from "./limits.js";
export * from "./llm-idle-timeout.js";
export * from "./loader.js";
export * from "./log.js";
export * from "./logger.js";
export * from "./ls.js";
export * from "./manage.js";
export * from "./manifest-capability-availability.js";
export * from "./manual-compaction-boundary.js";
export * from "./media-generate-background-shared.js";
export * from "./media-generate-tool-actions-shared.js";
export * from "./media-tool-shared.js";
export * from "./message-action-discovery-input.js";
export * from "./message-merge-strategy.js";
export * from "./message-tool-terminal.js";
export * from "./message-tool.js";
export * from "./message-transform-stream-wrapper.js";
export * from "./messages.js";
export * from "./messaging-dedupe.js";
export * from "./midturn-precheck.js";
export * from "./model-config.helpers.js";
export * from "./model-context-tokens.js";
export * from "./model-discovery-cache.js";
export * from "./model-fallback-config-fixture.js";
export * from "./model-registry.js";
export * from "./model-resolver.js";
export * from "./model.inline-provider.js";
export * from "./model.provider-normalization.js";
export * from "./model.static-catalog.js";
export * from "./model.test-harness.js";
export * from "./model.js";
export * from "./models-config.e2e-harness.js";
export * from "./models-config.test-utils.js";
export * from "./music-generate-background.js";
export * from "./music-generate-tool.actions.js";
export * from "./music-generate-tool.js";
export * from "./native-hook-relay.js";
export * from "./nodes-tool-commands.js";
export * from "./nodes-tool-media.js";
export * from "./nodes-tool.js";
export * from "./nodes-utils.js";
export * from "./oauth-identity.js";
// CONFLICT: export * from "./oauth-manager.js";
export * from "./oauth-refresh-failure.js";
export * from "./oauth-refresh-lock-errors.js";
// CONFLICT: export * from "./oauth-shared.js";
export * from "./oauth-test-utils.js";
export * from "./oauth.js";
export * from "./openai.js";
export * from "./openclaw-tools.subagents.sessions-spawn.test-harness.js";
export * from "./openclaw-tools.subagents.test-harness.js";
export * from "./openrouter-model-capabilities.js";
export * from "./order.js";
export * from "./output-accumulator.js";
export * from "./package-manager.js";
export * from "./params.js";
export * from "./path-constants.js";
export * from "./path-resolve.js";
export * from "./payloads.js";
export * from "./pdf-native-providers.js";
export * from "./pdf-tool.helpers.js";
export * from "./pdf-tool.model-config.js";
export * from "./pdf-tool.js";
export * from "./persisted.js";
export * from "./policy.js";
export * from "./portability.js";
export * from "./post-compaction-loop-guard.js";
export * from "./preemptive-compaction.js";
export * from "./prepare.runtime.js";
export * from "./prepare.js";
export * from "./private-temp-file.js";
export * from "./profile-list.js";
export * from "./profiles.js";
export * from "./prompt-cache-observability.js";
export * from "./prompt-cache-retention.js";
export * from "./prompt-compaction-hook-helpers.js";
export * from "./prompt-templates.js";
export * from "./provider-display-names.js";
export * from "./provider-error-patterns.js";
export * from "./proxy.js";
export * from "./prune.js";
export * from "./pruner.js";
export * from "./read.js";
export * from "./registry.js";
export * from "./reliability.js";
export * from "./remote-fs-bridge.js";
export * from "./render-utils.js";
export * from "./repair.js";
export * from "./replay-history.js";
export * from "./replay-state.js";
export * from "./resolve-config-value.js";
export * from "./resource-loader.js";
export * from "./result-classification.js";
export * from "./result-fallback-classifier.js";
export * from "./retry-limit.js";
export * from "./run-context.js";
export * from "./run-state.js";
export * from "./run.overflow-compaction.fixture.js";
export * from "./run.overflow-compaction.harness.js";
export * from "./run.js";
export * from "./runner.js";
export * from "./runs.js";
export * from "./runtime-context-prompt.js";
export * from "./runtime-plugin.js";
export * from "./runtime-snapshots.js";
export * from "./runtime-status.js";
export * from "./runtime.js";
export * from "./sandbox-agent-config-fixtures.js";
export * from "./sandbox-info.js";
export * from "./sandbox-skills.js";
export * from "./sanitize-user-facing-text.js";
export * from "./sdk.js";
export * from "./selection.js";
export * from "./session-config.js";
export * from "./session-cwd.js";
export * from "./session-file-key.js";
export * from "./session-history.js";
export * from "./session-manager-cache.js";
export * from "./session-manager-init.js";
export * from "./session-manager-runtime-registry.js";
export * from "./session-manager.js";
export * from "./session-override.js";
export * from "./session-status-tool.js";
export * from "./session-status.runtime.js";
export * from "./session-store.runtime.js";
export * from "./session-store.js";
export * from "./session.js";
export * from "./sessions-access.js";
export * from "./sessions-announce-target.js";
export * from "./sessions-helpers.js";
export * from "./sessions-history-tool.js";
export * from "./sessions-list-tool.js";
export * from "./sessions-resolution.js";
export * from "./sessions-send-helpers.js";
export * from "./sessions-send-tokens.js";
export * from "./sessions-send-tool.a2a.js";
export * from "./sessions-send-tool.js";
export * from "./sessions-spawn-tool.js";
export * from "./sessions-yield-tool.js";
export * from "./settings-manager.js";
export * from "./settings.js";
export * from "./setup.js";
export * from "./shared.js";
export * from "./skill-workshop-tool.js";
export * from "./slash-commands.js";
export * from "./source-check.js";
export * from "./source-info.js";
export * from "./sqlite.js";
export * from "./ssh-backend.js";
export * from "./state-observation.js";
export * from "./state.js";
// CONFLICT: export * from "./store.js";
export * from "./stream-resolution.js";
export * from "./stream-wrapper.js";
export * from "./string-enum.js";
export * from "./subagent-gateway.js";
export * from "./subagent-registry.mocks.shared.js";
export * from "./subagents-tool.js";
export * from "./syntax-highlight.js";
export * from "./telemetry.js";
export * from "./temp-plugin-extension-fixtures.js";
export * from "./test-fixtures.js";
export * from "./theme.js";
export * from "./thinking-replay-repair.js";
export * from "./thinking.js";
export * from "./toml-inline.js";
export * from "./tool-call-argument-decoding.js";
export * from "./tool-contracts.js";
export * from "./tool-definition-wrapper.js";
export * from "./tool-media-payloads.js";
export * from "./tool-name-allowlist.js";
export * from "./tool-result-char-estimator.js";
export * from "./tool-result-context-guard.js";
export * from "./tool-result-middleware.js";
export * from "./tool-result-truncation.js";
export * from "./tool-runtime.helpers.js";
export * from "./tool-schema-runtime.js";
export * from "./tool-send-receipts.js";
export * from "./tool-split.js";
export * from "./tool-surface-bridge.js";
export * from "./tools-manager.js";
export * from "./tools.js";
export * from "./transcript-file-state.js";
export * from "./transcript-rewrite.js";
export * from "./transcript-runtime-state.js";
export * from "./transcripts-tool.js";
export * from "./trigger-policy.js";
export * from "./truncate.js";
export * from "./tts-tool.js";
export * from "./turns.js";
export * from "./typebox.js";
export * from "./unsafe-mounted-sandbox.js";
export * from "./update-plan-tool.js";
// CONFLICT: export * from "./upsert-with-lock.js";
export * from "./usage-accumulator.js";
export * from "./usage-fixtures.js";
export * from "./usage-state.js";
export * from "./user-input-bridge.js";
export * from "./utils.js";
export * from "./validate-sandbox-security.js";
export * from "./video-generate-background.js";
export * from "./video-generate-tool.actions.js";
export * from "./video-generate-tool.js";
export * from "./visual-truncate.js";
export * from "./wait-for-idle-before-flush.js";
export * from "./web-fetch-utils.js";
export * from "./web-fetch-visibility.js";
export * from "./web-fetch.test-harness.js";
export * from "./web-fetch.test-mocks.js";
export * from "./web-fetch.js";
export * from "./web-guarded-fetch.js";
export * from "./web-search-citation-redirect.js";
export * from "./web-search-provider-common.js";
export * from "./web-search-provider-config.js";
export * from "./web-search-provider-credentials.js";
export * from "./web-search.js";
export * from "./web-shared.js";
export * from "./web-tool-runtime-context.js";
export * from "./web-tools.js";
export * from "./workspace-mounts.js";
export * from "./wrapper.js";
export * from "./write.js";

/**
 * 共享辅助模块入口 — 跨模块复用的小工具
 */
export {
  resolveGlobalSingleton,
  resolveGlobalMap,
} from "./global-singleton.js";

export {
  resolveNonNegativeInteger,
  resolveNonNegativeNumber,
  clampNumber,
  clampPositiveTimerTimeoutMs,
  resolveTimerTimeoutMs,
} from "./number-coercion.js";

// PID 存活检测
export {
  isPidAlive,
  isPidDefinitelyDead,
  getProcessStartTime,
} from "./pid-alive.js";

// 监听器与事件通知
export { notifyListeners, registerListener } from "./listeners.js";

// 聊天内容文本提取
export { coerceChatContentText, extractTextFromChatContent } from "./chat-content.js";

// 字符串距离
export { levenshteinDistance } from "./levenshtein-distance.js";

// 惰性 Promise 与运行时加载
export {
  type LazyPromiseLoader,
  createLazyPromiseLoader,
  createLazyImportLoader,
} from "./lazy-promise.js";
export {
  createLazyRuntimeSurface,
  createLazyRuntimeModule,
  createLazyRuntimeNamedExport,
  createLazyRuntimeMethod,
  createLazyRuntimeMethodBinder,
} from "./lazy-runtime.js";

// 平衡 JSON 片段扫描
export {
  extractBalancedJsonPrefix,
  extractBalancedJsonFragments,
} from "./balanced-json.js";

// 按 scope 的 TTL 缓存
export {
  type ScopedExpiringIdCache,
  createScopedExpiringIdCache,
} from "./scoped-expiring-id-cache.js";

// 路径数组索引解析
export { parseConfigPathArrayIndex } from "./path-array-index.js";

// 正则表达式转义
export { escapeRegExp } from "./regexp.js";

// 防御性 record 守卫
export {
  isRecord,
  readRecordValue,
  copyArrayEntries,
  copyRecordEntries,
} from "./safe-record.js";

// 人类可读列表
export { formatHumanList } from "./human-list.js";

// Schema 关键字剥除
export { stripUnsupportedSchemaKeywords } from "./schema-keyword-strip.js";

// 延迟事件缓冲
export { createDeferredEventBuffer } from "./deferred-event-buffer.js";

// 字符串采样
export { summarizeStringEntries } from "./string-sample.js";

// 文本切片
export {
  avoidTrailingHighSurrogateBreak,
  chunkTextByBreakResolver,
} from "./text-chunking.js";

// 账户启用判定
export { isAccountEnabled } from "./account-enabled.js";

// Agent liveness 状态
export {
  isBlockedLivenessState,
  formatBlockedLivenessError,
  normalizeBlockedLivenessWaitStatus,
} from "./agent-liveness.js";

// Agent 运行状态谓词
export { isNonTerminalAgentRunStatus } from "./agent-run-status.js";

// 配置 UI 提示类型
export type { ConfigUiHint, ConfigUiHints } from "./config-ui-hints-types.js";

// Gateway 会话类型
export type {
  GatewayAgentIdentity,
  GatewayAgentModel,
  GatewayAgentRuntime,
  GatewayThinkingLevelOption,
  GatewayAgentRow,
  SessionsListResultBase,
  SessionsPatchResultBase,
} from "./session-types.js";

// LLM 请求活动通知
export { notifyLlmRequestActivity, onLlmRequestActivity } from "./llm-request-activity.js";

// Anthropic Foundry 认证头
export {
  usesFoundryBearerAuth,
  omitFoundryBearerCredentialHeaders,
} from "./anthropic-auth-headers.js";

// 导入规范符辅助
export { toSafeImportPath } from "./import-specifier.js";

// 运行时导入辅助
export {
  resolveRuntimeImportSpecifier,
  importRuntimeModule,
} from "./runtime-import.js";

// store 写入队列
export {
  type StoreWriterTask,
  type StoreWriterQueue,
  runQueuedStoreWrite,
  clearStoreWriterQueuesForTest,
  drainStoreWriterQueuesForTest,
} from "./store-writer-queue.js";

// provider/model 规范 key
export { modelKey } from "./model-key.js";

// gateway 方法策略
export type { GatewayMethodPolicy } from "./gateway-method-policy.js";
export {
  DEFAULT_GATEWAY_METHOD_POLICY,
  isTransportAllowed,
} from "./gateway-method-policy.js";

// 配置要求检查
export type { RequirementCheckResult } from "./requirements.js";
export { requirementResult, mergeRequirements } from "./requirements.js";

// 文本处理工具
export { type CodeRegion, findCodeRegions, isInsideCode } from "./text/code-regions.js";
export { findFinalTagMatches, stripFinalTags } from "./text/final-tags.js";
export { stripMarkdown } from "./text/strip-markdown.js";
export {
  concatOptionalTextSegments,
  joinPresentTextSegments,
} from "./text/join-segments.js";
export { stripModelSpecialTokens } from "./text/model-special-tokens.js";
export { stripUnsupportedCitationControlMarkers } from "./text/citation-control-markers.js";

// ===== 深度完善档一 - 第 1+2 批 =====

// 使用统计聚合
export {
  mergeUsageLatency,
  mergeUsageDailyLatency,
  buildUsageAggregateTail,
} from "./usage-aggregates.js";

// Operator scope 兼容性
export {
  roleScopesAllow,
  resolveMissingRequestedScope,
  resolveScopeOutsideRequestedRoles,
} from "./operator-scope-compat.js";

// 节点列表类型
export type {
  NodeListNode,
  PendingRequest,
  PairedNode,
  PairingList,
} from "./node-list-types.js";

// Azure OpenAI Responses 客户端兼容
export {
  isTraditionalAzureOpenAIHost,
  isOpenAICompatibleAzureResponsesBaseUrl,
} from "./azure-openai-responses-client-compat.js";

// OpenAI Responses 流兼容
export {
  OPENAI_RESPONSES_OUTPUT_TEXT_CONTENT_PART_TYPE,
  AZURE_RESPONSES_TEXT_CONTENT_PART_TYPE,
  OPENAI_RESPONSES_OUTPUT_TEXT_DELTA_EVENT_TYPE,
  AZURE_RESPONSES_TEXT_DELTA_EVENT_TYPE,
  isResponsesTextContentPartType,
  isResponsesTextDeltaEventType,
  isAzureResponsesTextDeltaEventType,
  isAzureResponsesTextDeltaEvent,
  resolveResponsesMessageSnapshotCollapse,
} from "./openai-responses-stream-compat.js";
export type {
  ResponsesTextContentPartType,
  ResponsesTextDeltaEventType,
  AzureResponsesTextContentPart,
  AzureResponsesTextDeltaEvent,
  ResponsesMessageSnapshotCollapse,
} from "./openai-responses-stream-compat.js";

// 内容块遍历
export { visitObjectContentBlocks } from "./message-content-blocks.js";

// JSON Schema 类型
export type { JsonSchemaObject } from "./json-schema.types.js";

// JSON Schema 默认值
export {
  repairJsonSchemaPatternForUnicodeRegExp,
  normalizeJsonSchemaForTypeBox,
  findJsonSchemaShapeError,
  applyJsonSchemaDefaults,
} from "./json-schema-defaults.js";

// 入口元数据
export { resolveEmojiAndHomepage } from "./entry-metadata.js";

// Assistant identity 取值
export { coerceIdentityValue } from "./assistant-identity-values.js";

// Silent reply 策略
export {
  DEFAULT_SILENT_REPLY_POLICY,
  classifySilentReplyConversationType,
  resolveSilentReplyPolicyFromPolicies,
} from "./silent-reply-policy.js";
export type {
  SilentReplyPolicy,
  SilentReplyConversationType,
  SilentReplyPolicyShape,
} from "./silent-reply-policy.js";

// 自定义命令配置
export {
  normalizeSlashCommandName,
  normalizeCommandDescription,
  resolveCustomCommands,
} from "./custom-command-config.js";
export type {
  CustomCommandInput,
  CustomCommandIssue,
  CustomCommandConfig,
} from "./custom-command-config.js";

// 节点匹配
export {
  normalizeNodeKey,
  resolveNodeIdFromCandidates,
} from "./node-match.js";
export type { NodeMatchCandidate } from "./node-match.js";

// 节点存活事件
export {
  NODE_PRESENCE_ALIVE_EVENT,
  normalizeNodePresenceAliveReason,
} from "./node-presence.js";

// Gateway 绑定 URL
export { resolveGatewayBindUrl } from "./gateway-bind-url.js";
export type { GatewayBindUrlResult } from "./gateway-bind-url.js";

// Model param B 推断
export { inferParamBFromIdOrName } from "./model-param-b.js";

// 节点列表解析
export { parsePairingList, parseNodeList } from "./node-list-parse.js";

// 节点解析
export {
  resolveNodeIdFromNodeList,
  resolveNodeFromNodeList,
} from "./node-resolve.js";

// Avatar 策略
export {
  AVATAR_MAX_BYTES,
  resolveAvatarMime,
  isAvatarDataUrl,
  isAvatarImageDataUrl,
  isAvatarHttpUrl,
  hasAvatarUriScheme,
  isWindowsAbsolutePath,
  isWorkspaceRelativeAvatarPath,
  isPathWithinRoot,
  looksLikeAvatarPath,
  isSupportedLocalAvatarExtension,
} from "./avatar-policy.js";

// Frontmatter 解析
export {
  normalizeStringList,
  getFrontmatterString,
  parseFrontmatterBool,
  resolveOpenClawManifestBlock,
  resolveOpenClawManifestRequires,
  resolveOpenClawManifestInstall,
  resolveOpenClawManifestOs,
  parseOpenClawManifestInstallBase,
  applyOpenClawManifestInstallCommonFields,
} from "./frontmatter.js";
export type {
  OpenClawManifestRequires,
  ParsedOpenClawManifestInstallBase,
} from "./frontmatter.js";

// Legacy 名称常量
export {
  PROJECT_NAME,
  MANIFEST_KEY,
  LEGACY_MANIFEST_KEYS,
  MACOS_APP_SOURCES_DIR,
} from "./legacy-names.js";

// ===== 深度完善 - 第 3 批 =====

// Subagent 格式化工具（token 数量、截断等）
export {
  formatTokenShort,
  truncateLine,
  resolveTotalTokens,
  resolveIoTokens,
  formatTokenUsageDisplay,
} from "./subagents-format.js";

// Assistant 错误格式化（API 错误解析、HTML 错误检测等）
export {
  MALFORMED_STREAMING_FRAGMENT_ERROR_MESSAGE,
  parseApiErrorPayload,
  extractLeadingHttpStatus,
  isCloudflareOrHtmlErrorPage,
  isGenericProviderInternalError,
  parseApiErrorInfo,
  formatRawAssistantErrorForUi,
} from "./assistant-error-format.js";

// 会话使用时间序列类型
export type {
  SessionUsageTimePoint,
  SessionUsageTimeSeries,
} from "./session-usage-timeseries-types.js";

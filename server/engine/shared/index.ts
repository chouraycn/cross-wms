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

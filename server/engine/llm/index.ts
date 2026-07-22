// 原始 API（保持向后兼容）
export type { Api, Model, Usage, ModelThinkingLevel, ModelCost, StreamEvent, CompleteOptions, StreamOptions } from './types.js';
export { complete, completeSimple, stream, streamSimple } from './stream.js';
export { getEnvApiKey, hasEnvApiKey, listProvidersWithEnvKeys } from './env-api-keys.js';
export { calculateCost, getSupportedThinkingLevels, clampThinkingLevel, modelsAreEqual } from './model-utils.js';
export type { ModelRegistry, ModelRegistryEntry } from './model-registry.js';
export { registerModel, getModel, listRegisteredModels, findModel, findModelsByProvider, clearModelRegistry } from './model-registry.js';
export type { ApiProvider, ApiProviderContext } from './api-registry.js';
export { registerApiProvider, getApiProvider, listApiProviders, clearApiProviderRegistry } from './api-registry.js';
export type { OAuthFlowResult, OAuthProvider } from './oauth.js';
export { startOAuthFlow, refreshOAuthToken, isOAuthTokenExpired, getStoredOAuthToken, clearStoredOAuthToken } from './oauth.js';

// LLM 调用统一包装器
export type { InvokeResult, InvokeOptions, CircuitState } from './llm-invoker.js';
export {
  invokeWithGuards,
  LlmCircuitBreaker,
  getCircuitBreaker,
  removeCircuitBreaker,
  clearCircuitBreakers,
  listCircuitBreakers,
  CircuitOpenError,
  RateLimitExceededError,
  DEFAULT_CIRCUIT_BREAKER_OPTIONS,
} from './llm-invoker.js';

// Provider 抽象层
export type {
  Provider,
  ProviderInfo,
  ProviderRegion,
  ProviderRequestContext,
  ProviderHeaderBuilder,
  ProviderRequestBodyBuilder,
  ProviderStreamChunkParser,
  ProviderUsageParser,
  ProviderFinishReasonMapper,
} from './providers/types.js';
export {
  registerProvider,
  getProvider,
  listProviders,
  listProviderNames,
  listProvidersByRegion,
  listCnProviders,
  clearProviderRegistry,
  registerBuiltinProviders,
} from './providers/index.js';
export * from './providers/openai.js';
export * from './providers/anthropic.js';
export * from './providers/google.js';
export * from './providers/azure.js';
export * from './providers/bedrock.js';
export * from './providers/ollama.js';
export * from './providers/deepseek.js';
export * from './providers/moonshot.js';
export * from './providers/qwen.js';
export * from './providers/zhipu.js';
export * from './providers/minimax.js';
export * from './providers/baichuan.js';
export * from './providers/ernie.js';
export * from './providers/spark.js';
export * from './providers/yi.js';

// 消息格式转换
export type {
  UnifiedMessage,
  OpenAIMessage,
  AnthropicMessage,
  GeminiPart,
  GeminiContent,
  TransformedMessages,
} from './message-transform.js';
export {
  transformMessages,
  toOpenAIMessages,
  toAnthropicMessages,
  toGeminiContents,
  fromOpenAIMessages,
  fromAnthropicMessages,
  truncateMessages,
  estimateTokens,
  countMessagesTokens,
  fromCompleteOptions,
} from './message-transform.js';

// 流式适配器
export type { SSEFrame } from './stream-adapter.js';
export {
  parseSSEChunk,
  parseSSEData,
  parseNDJSONChunk,
  parseBedrockEventStreamChunk,
  asyncIterableToStreamEvents,
  makeSSEParser,
  makeNDJSONParser,
  mergeStreamEvents,
  collectText,
  collectUsage,
} from './stream-adapter.js';

// Token 计数器
export type { TokenEstimatorConfig } from './token-counter.js';
export {
  TOKEN_ESTIMATORS,
  countChars,
  estimateTokensForText,
  estimateMessageTokens,
  countMessageTokens as countTokensForMessages,
  estimateTokensForModel,
  hasEnoughContext,
  remainingInputTokens,
} from './token-counter.js';
export { countMessageTokens } from './token-counter.js';

// 价格计算器
export type { CostBreakdown, BillingEntry, Currency } from './price-calculator.js';
export {
  computeCost,
  recomputeCost,
  CostAccumulator,
  formatCost,
  formatCostDual,
  convertCost,
  setExchangeRate,
  getExchangeRate,
  formatTokens,
  computeCacheSavings,
} from './price-calculator.js';

// 能力检测
export type { Capability } from './capability-detector.js';
export {
  PROVIDER_DEFAULT_CAPABILITIES,
  hasCapability,
  matchesVisionId,
  matchesThinkingId,
  listCapabilities,
  filterByCapability,
  apiSupportsStreaming,
  apiSupportsFunctionCalling,
  capabilityDiff,
} from './capability-detector.js';

// 模型映射
export {
  resolveAlias,
  resolveVersion,
  stripRegionSuffix,
  mapModelId,
  registerAlias,
  registerVersionFallback,
  resolveCustomAlias,
  resolveCustomVersion,
  findModelByReference,
  listBuiltinAliases,
  listBuiltinVersionFallbacks,
  clearCustomMappings,
} from './model-mapper.js';

// 速率限制
export type { RateLimitConfig, RateLimitSnapshot } from './rate-limiter.js';
export {
  RateLimiter,
  getRateLimiter,
  removeRateLimiter,
  clearRateLimiters,
  DEFAULT_PROVIDER_LIMITS,
} from './rate-limiter.js';

// 重试处理
export type { RetryConfig, RetryDecision } from './retry-handler.js';
export {
  DEFAULT_RETRY_CONFIG,
  computeBackoffDelay,
  shouldRetry,
  sleep,
  withRetry,
  extractRetryAfter,
  makeAlwaysFailFn,
  makeSucceedAfterNFn,
} from './retry-handler.js';

// 错误映射
export type { LLMErrorCode, ErrorClassification } from './error-mapper.js';
export {
  LLMError,
  classifyHttpStatus,
  isRetryableCode,
  isContentFilterError,
  isComplianceError,
  classifyError,
  toLLMError,
  classifyProviderError,
  extractProviderErrorMessage,
  logLLMError,
} from './error-mapper.js';

// 请求头管理
export type { AuthScheme, HeaderOptions } from './headers.js';
export {
  DEFAULT_USER_AGENT,
  buildAuthHeaders,
  buildHeaders,
  mergeHeaders,
  generateRequestId,
  headersToRecord,
  redactSensitiveHeaders,
  buildTracingHeaders,
} from './headers.js';

// 会话资源管理
export type { SessionResourceCleanup, CleanupResult } from './session-resources.js';
export {
  registerSessionResourceCleanup,
  registerScopedSessionResourceCleanup,
  cleanupSessionResources,
  cleanupSession,
  listActiveSessions,
  countSessionCleanups,
  clearAllSessionCleanups,
  createTrackedAbortController,
  trackReader,
} from './session-resources.js';

// LLM 工具函数
export { sanitizeSurrogates } from './utils/sanitize-unicode.js';
export type { OpenAICodexJwtPayload } from './utils/openai-chatgpt-jwt.js';
export {
  decodeOpenAICodexJwtPayload,
  resolveOpenAICodexAccountId,
} from './utils/openai-chatgpt-jwt.js';

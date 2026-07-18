/**
 * LLM Provider Compat 类型 stub — 移植自 openclaw/packages/llm-core/src/types.ts
 *
 * 本文件提供 types.models.ts 移植所需的最小 LLM compat 类型契约。
 * cross-wms 的 LLM 子系统（server/engine/llm/）是自定义实现，
 * 与 openclaw 的 @openclaw/llm-core 类型契约不同；此处仅保留
 * config 类型层级所需的兼容性字段。
 *
 * 参考 openclaw/packages/llm-core/src/types.ts
 */

/** 规范化推理强度等级 */
export type ThinkingLevel = "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

/** 包含显式禁用状态的模型 thinking 设置 */
export type ModelThinkingLevel = "off" | ThinkingLevel;

/** 各 thinking 等级到 provider 特定值的映射 */
export type ThinkingLevelMap = Partial<Record<ModelThinkingLevel, string | null>>;

/** OpenRouter 路由偏好 */
export interface OpenRouterRouting {
  allow_fallbacks?: boolean;
  require_parameters?: boolean;
  data_collection?: "deny" | "allow";
  zdr?: boolean;
  enforce_distillable_text?: boolean;
  order?: string[];
}

/** Vercel AI Gateway 路由偏好 */
export interface VercelGatewayRouting {
  only?: string[];
  order?: string[];
}

/** OpenAI-compatible completions API 兼容性设置 */
export interface OpenAICompletionsCompat {
  supportsStore?: boolean;
  supportsDeveloperRole?: boolean;
  supportsReasoningEffort?: boolean;
  supportsUsageInStreaming?: boolean;
  maxTokensField?: "max_completion_tokens" | "max_tokens";
  requiresToolResultName?: boolean;
  requiresAssistantAfterToolResult?: boolean;
  requiresThinkingAsText?: boolean;
  requiresReasoningContentOnAssistantMessages?: boolean;
  thinkingFormat?:
    | "openai"
    | "openrouter"
    | "deepseek"
    | "together"
    | "zai"
    | "qwen"
    | "qwen-chat-template";
  openRouterRouting?: OpenRouterRouting;
  vercelGatewayRouting?: VercelGatewayRouting;
  zaiToolStream?: boolean;
  supportsStrictMode?: boolean;
  cacheControlFormat?: "anthropic";
  sendSessionAffinityHeaders?: boolean;
  supportsPromptCacheKey?: boolean;
  supportsLongCacheRetention?: boolean;
}

/** OpenAI Responses API 兼容性设置 */
export interface OpenAIResponsesCompat {
  sendSessionIdHeader?: boolean;
  supportsLongCacheRetention?: boolean;
}

/** Anthropic Messages-compatible API 兼容性设置 */
export interface AnthropicMessagesCompat {
  supportsEagerToolInputStreaming?: boolean;
  supportsLongCacheRetention?: boolean;
  sendSessionAffinityHeaders?: boolean;
}

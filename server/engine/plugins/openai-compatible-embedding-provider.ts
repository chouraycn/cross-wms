/**
 * Builds OpenAI-compatible embedding provider entries for plugins.
 * 移植自 openclaw/src/plugins/openai-compatible-embedding-provider.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export const OPENAI_COMPATIBLE_EMBEDDING_PROVIDER_ID: unknown = undefined;

export type OpenAICompatibleEmbeddingClient = unknown;



export const openAICompatibleEmbeddingProviderAdapter: unknown = undefined;


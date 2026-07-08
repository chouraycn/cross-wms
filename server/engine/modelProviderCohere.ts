/**
 * Cohere 模型提供商
 *
 * baseUrl: https://api.cohere.com/v1
 * authType: bearer
 *
 * Cohere 系列模型：
 * - Command R+（推理旗舰）
 * - Command R（推理）
 * - Command（通用）
 * - Command Light（轻量）
 */

import type { ProviderInfo, ModelInfo } from './modelCatalog.js';

/** Cohere 模型列表 */
const COHERE_MODELS: ModelInfo[] = [
  {
    id: 'command-r-plus',
    name: 'Command R+',
    provider: 'cohere',
    description: 'Cohere Command R+，旗舰推理模型，支持长上下文',
    contextWindow: 128_000,
    maxTokens: 50_000,
    input: ['text'],
    capabilities: ['reasoning', 'code', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    supportsFunctionCall: true,
    apiType: 'openai-chat',
    isRecommended: true,
    pricing: {
      inputPerMillion: 3,
      outputPerMillion: 15,
    },
  },
  {
    id: 'command-r',
    name: 'Command R',
    provider: 'cohere',
    description: 'Cohere Command R，强大推理模型',
    contextWindow: 128_000,
    maxTokens: 20_000,
    input: ['text'],
    capabilities: ['reasoning', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    supportsFunctionCall: true,
    apiType: 'openai-chat',
    isRecommended: true,
    pricing: {
      inputPerMillion: 0.5,
      outputPerMillion: 1.5,
    },
  },
  {
    id: 'command',
    name: 'Command',
    provider: 'cohere',
    description: 'Cohere Command，通用指令遵循模型',
    contextWindow: 25_000,
    maxTokens: 4_096,
    input: ['text'],
    capabilities: ['general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-chat',
    pricing: {
      inputPerMillion: 1.5,
      outputPerMillion: 4.5,
    },
  },
  {
    id: 'command-light',
    name: 'Command Light',
    provider: 'cohere',
    description: 'Cohere Command Light，轻量快速、高性价比',
    contextWindow: 25_000,
    maxTokens: 4_096,
    input: ['text'],
    capabilities: ['fast', 'costEffective', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-chat',
    pricing: {
      inputPerMillion: 0.3,
      outputPerMillion: 0.9,
    },
  },
];

/** Cohere 提供商信息 */
export const COHERE_PROVIDER: ProviderInfo = {
  id: 'cohere',
  name: 'Cohere',
  label: 'Cohere',
  description: 'Cohere AI 模型提供商',
  baseUrl: 'https://api.cohere.com/v1',
  authType: 'bearer',
  categories: ['international'],
  models: COHERE_MODELS,
  envVars: ['COHERE_API_KEY'],
  supportedApiTypes: ['openai-chat'],
};

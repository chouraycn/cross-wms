/**
 * Fireworks AI 模型提供商
 *
 * baseUrl: https://api.fireworks.ai/inference/v1
 * authType: bearer
 *
 * Fireworks 系列模型：
 * - Kimi K2.6（多模态）
 * - Llama 系列（开源模型托管）
 * - Mixtral 系列
 */

import type { ProviderInfo, ModelInfo } from './modelCatalog.js';

/** Fireworks AI 模型列表 */
const FIREWORKS_MODELS: ModelInfo[] = [
  {
    id: 'accounts/fireworks/models/kimi-k2p6',
    name: 'Kimi K2.6',
    provider: 'fireworks',
    description: 'Fireworks Kimi K2.6，多模态模型',
    contextWindow: 262_144,
    maxTokens: 262_144,
    input: ['text', 'image'],
    capabilities: ['multimodal', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-chat',
    isRecommended: true,
    pricing: {
      inputPerMillion: 0.95,
      outputPerMillion: 4,
    },
  },
  {
    id: 'accounts/fireworks/routers/kimi-k2p5-turbo',
    name: 'Kimi K2.5 Turbo (Fire Pass)',
    provider: 'fireworks',
    description: 'Fireworks Kimi K2.5 Turbo，免费试用',
    contextWindow: 256_000,
    maxTokens: 256_000,
    input: ['text', 'image'],
    capabilities: ['multimodal', 'fast', 'costEffective', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-chat',
    isRecommended: true,
  },
  {
    id: 'accounts/fireworks/models/llama-v3-70b-instruct',
    name: 'Llama 3 70B',
    provider: 'fireworks',
    description: 'Fireworks Llama 3 70B Instruct',
    contextWindow: 128_000,
    maxTokens: 32_000,
    input: ['text'],
    capabilities: ['reasoning', 'code', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-chat',
    pricing: {
      inputPerMillion: 0.8,
      outputPerMillion: 2.4,
    },
  },
  {
    id: 'accounts/fireworks/models/llama-v3-8b-instruct',
    name: 'Llama 3 8B',
    provider: 'fireworks',
    description: 'Fireworks Llama 3 8B Instruct，轻量快速',
    contextWindow: 128_000,
    maxTokens: 16_000,
    input: ['text'],
    capabilities: ['fast', 'costEffective', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-chat',
    pricing: {
      inputPerMillion: 0.08,
      outputPerMillion: 0.24,
    },
  },
  {
    id: 'accounts/fireworks/models/mixtral-8x22b-instruct',
    name: 'Mixtral 8x22B',
    provider: 'fireworks',
    description: 'Fireworks Mixtral 8x22B Instruct',
    contextWindow: 128_000,
    maxTokens: 32_000,
    input: ['text'],
    capabilities: ['reasoning', 'code', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-chat',
    pricing: {
      inputPerMillion: 0.6,
      outputPerMillion: 1.8,
    },
  },
];

/** Fireworks AI 提供商信息 */
export const FIREWORKS_PROVIDER: ProviderInfo = {
  id: 'fireworks',
  name: 'Fireworks AI',
  label: 'Fireworks',
  description: 'Fireworks AI 模型提供商（开源模型托管）',
  baseUrl: 'https://api.fireworks.ai/inference/v1',
  authType: 'bearer',
  categories: ['international', 'cloud'],
  models: FIREWORKS_MODELS,
  envVars: ['FIREWORKS_API_KEY'],
  supportedApiTypes: ['openai-chat'],
};

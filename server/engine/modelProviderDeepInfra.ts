/**
 * DeepInfra 模型提供商
 *
 * baseUrl: https://api.deepinfra.com/v1/openai
 * authType: bearer
 *
 * DeepInfra 提供开源模型的统一 API 访问：
 * - Llama 系列
 * - Mistral 系列
 * - Qwen 系列
 * - 以及其他开源模型
 */

import type { ProviderInfo, ModelInfo } from './modelCatalog.js';

/** DeepInfra 模型列表 */
const DEEPINFRA_MODELS: ModelInfo[] = [
  {
    id: 'meta-llama/Meta-Llama-3-70B-Instruct',
    name: 'Llama 3 70B',
    provider: 'deepinfra',
    description: 'DeepInfra Llama 3 70B Instruct',
    contextWindow: 128_000,
    maxTokens: 32_000,
    input: ['text'],
    capabilities: ['reasoning', 'code', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-chat',
    isRecommended: true,
    pricing: {
      inputPerMillion: 0.5,
      outputPerMillion: 1.5,
    },
  },
  {
    id: 'meta-llama/Meta-Llama-3-8B-Instruct',
    name: 'Llama 3 8B',
    provider: 'deepinfra',
    description: 'DeepInfra Llama 3 8B Instruct，轻量快速',
    contextWindow: 128_000,
    maxTokens: 16_000,
    input: ['text'],
    capabilities: ['fast', 'costEffective', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-chat',
    isRecommended: true,
    pricing: {
      inputPerMillion: 0.05,
      outputPerMillion: 0.15,
    },
  },
  {
    id: 'mistralai/Mistral-8x7B-Instruct-v0.2',
    name: 'Mixtral 8x7B',
    provider: 'deepinfra',
    description: 'DeepInfra Mixtral 8x7B Instruct',
    contextWindow: 32_000,
    maxTokens: 8_192,
    input: ['text'],
    capabilities: ['reasoning', 'code', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-chat',
    pricing: {
      inputPerMillion: 0.3,
      outputPerMillion: 0.9,
    },
  },
  {
    id: 'mistralai/Mistral-7B-Instruct-v0.2',
    name: 'Mistral 7B',
    provider: 'deepinfra',
    description: 'DeepInfra Mistral 7B Instruct',
    contextWindow: 8_000,
    maxTokens: 4_096,
    input: ['text'],
    capabilities: ['fast', 'costEffective', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-chat',
    pricing: {
      inputPerMillion: 0.04,
      outputPerMillion: 0.12,
    },
  },
  {
    id: 'Qwen/Qwen2-72B-Instruct',
    name: 'Qwen2 72B',
    provider: 'deepinfra',
    description: 'DeepInfra Qwen2 72B Instruct',
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
  {
    id: 'Qwen/Qwen2-7B-Instruct',
    name: 'Qwen2 7B',
    provider: 'deepinfra',
    description: 'DeepInfra Qwen2 7B Instruct',
    contextWindow: 128_000,
    maxTokens: 16_000,
    input: ['text'],
    capabilities: ['fast', 'costEffective', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-chat',
    pricing: {
      inputPerMillion: 0.06,
      outputPerMillion: 0.18,
    },
  },
];

/** DeepInfra 提供商信息 */
export const DEEPINFRA_PROVIDER: ProviderInfo = {
  id: 'deepinfra',
  name: 'DeepInfra',
  label: 'DeepInfra',
  description: 'DeepInfra 模型提供商（开源模型统一 API）',
  baseUrl: 'https://api.deepinfra.com/v1/openai',
  authType: 'bearer',
  categories: ['international', 'cloud'],
  models: DEEPINFRA_MODELS,
  envVars: ['DEEPINFRA_API_KEY'],
  supportedApiTypes: ['openai-chat'],
};

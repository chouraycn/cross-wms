/**
 * NVIDIA NIM 模型提供商
 *
 * baseUrl: https://integrate.api.nvidia.com/v1
 * authType: bearer
 *
 * NVIDIA NIM 提供多种优化模型：
 * - Meta Llama 3.1
 * - Mistral NeMo
 * - Google Gemma 2
 */

import type { ProviderInfo, ModelInfo } from './modelCatalog.js';

/** NVIDIA NIM 模型列表 */
const NVIDIA_MODELS: ModelInfo[] = [
  {
    id: 'meta/llama-3.1-405b-instruct',
    name: 'Llama 3.1 405B',
    provider: 'nvidia',
    description: 'NVIDIA NIM Llama 3.1 405B，最强开源模型',
    contextWindow: 128_000,
    maxTokens: 4_096,
    input: ['text'],
    capabilities: ['reasoning', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-chat',
    pricing: {
      inputPerMillion: 2,
      outputPerMillion: 2,
    },
  },
  {
    id: 'meta/llama-3.1-70b-instruct',
    name: 'Llama 3.1 70B',
    provider: 'nvidia',
    description: 'NVIDIA NIM Llama 3.1 70B，均衡推理',
    contextWindow: 128_000,
    maxTokens: 4_096,
    input: ['text'],
    capabilities: ['general', 'reasoning'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-chat',
    isRecommended: true,
    pricing: {
      inputPerMillion: 0.2,
      outputPerMillion: 0.2,
    },
  },
  {
    id: 'meta/llama-3.1-8b-instruct',
    name: 'Llama 3.1 8B',
    provider: 'nvidia',
    description: 'NVIDIA NIM Llama 3.1 8B，轻量快速',
    contextWindow: 128_000,
    maxTokens: 4_096,
    input: ['text'],
    capabilities: ['fast', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-chat',
    pricing: {
      inputPerMillion: 0.02,
      outputPerMillion: 0.02,
    },
  },
  {
    id: 'mistralai/mistral-nemo-12b-instruct',
    name: 'Mistral NeMo 12B',
    provider: 'nvidia',
    description: 'NVIDIA NIM Mistral NeMo，轻量推理',
    contextWindow: 128_000,
    maxTokens: 4_096,
    input: ['text'],
    capabilities: ['general', 'fast'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-chat',
    pricing: {
      inputPerMillion: 0.02,
      outputPerMillion: 0.02,
    },
  },
  {
    id: 'google/gemma-2-27b-it',
    name: 'Gemma 2 27B',
    provider: 'nvidia',
    description: 'NVIDIA NIM Gemma 2 27B',
    contextWindow: 8_000,
    maxTokens: 4_096,
    input: ['text'],
    capabilities: ['general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-chat',
    pricing: {
      inputPerMillion: 0.02,
      outputPerMillion: 0.02,
    },
  },
  {
    id: 'deepseek-ai/deepseek-r1',
    name: 'DeepSeek R1 (NIM)',
    provider: 'nvidia',
    description: 'NVIDIA NIM DeepSeek R1，推理模型',
    contextWindow: 128_000,
    maxTokens: 4_096,
    input: ['text'],
    capabilities: ['reasoning', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-chat',
    reasoning: true,
    pricing: {
      inputPerMillion: 0.1,
      outputPerMillion: 0.1,
    },
  },
];

/** NVIDIA 提供商信息 */
export const NVIDIA_PROVIDER: ProviderInfo = {
  id: 'nvidia',
  name: 'NVIDIA NIM',
  baseUrl: 'https://integrate.api.nvidia.com/v1',
  authType: 'bearer',
  categories: ['cloud', 'llm', 'international'],
  docsPath: '/providers/nvidia',
  models: NVIDIA_MODELS,
  description: 'NVIDIA NIM 推理微服务，GPU 加速',
  website: 'https://build.nvidia.com',
  auth: [
    {
      methodId: 'api-key',
      label: 'NVIDIA API Key',
      hint: '从 NVIDIA Build 获取',
      envVar: 'NVIDIA_API_KEY',
      flagName: '--nvidia-api-key',
      optionKey: 'nvidiaApiKey',
      promptMessage: '请输入 NVIDIA API Key',
      defaultModel: 'meta/llama-3.1-70b-instruct',
    },
  ],
};
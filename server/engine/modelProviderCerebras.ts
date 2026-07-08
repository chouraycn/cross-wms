/**
 * Cerebras 模型提供商
 *
 * baseUrl: https://api.cerebras.ai/v1
 * authType: bearer
 *
 * Cerebras 以极低延迟推理著称，基于 CS-3 晶圆级引擎：
 * - Llama 3.3 70B
 * - Llama 3.1 8B
 */

import type { ProviderInfo, ModelInfo } from './modelCatalog.js';

/** Cerebras 模型列表 */
const CEREBRAS_MODELS: ModelInfo[] = [
  {
    id: 'llama-3.3-70b',
    name: 'Llama 3.3 70B',
    provider: 'cerebras',
    description: 'Cerebras Llama 3.3 70B，极速推理',
    contextWindow: 128_000,
    maxTokens: 8_192,
    input: ['text'],
    capabilities: ['fast', 'general', 'reasoning'],
    supportsTools: true,
    supportsStreaming: true,
    supportsFunctionCall: true,
    apiType: 'openai-chat',
    isRecommended: true,
    pricing: {
      isFree: false,
      inputPerMillion: 0.85,
      outputPerMillion: 1.20,
      note: 'Cerebras 按用量计费',
    },
  },
  {
    id: 'llama-3.1-8b',
    name: 'Llama 3.1 8B',
    provider: 'cerebras',
    description: 'Cerebras Llama 3.1 8B，最快轻量推理',
    contextWindow: 128_000,
    maxTokens: 8_192,
    input: ['text'],
    capabilities: ['fast', 'costEffective', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-chat',
    pricing: {
      isFree: false,
      inputPerMillion: 0.10,
      outputPerMillion: 0.10,
    },
  },
  {
    id: 'llama3.1-70b',
    name: 'Llama 3.1 70B',
    provider: 'cerebras',
    description: 'Cerebras Llama 3.1 70B',
    contextWindow: 128_000,
    maxTokens: 8_192,
    input: ['text'],
    capabilities: ['fast', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-chat',
    pricing: {
      isFree: false,
      inputPerMillion: 0.85,
      outputPerMillion: 1.20,
    },
  },
];

/** Cerebras 提供商信息 */
export const CEREBRAS_PROVIDER: ProviderInfo = {
  id: 'cerebras',
  name: 'Cerebras',
  baseUrl: 'https://api.cerebras.ai/v1',
  authType: 'bearer',
  categories: ['cloud', 'llm', 'international', 'fast'],
  docsPath: '/providers/cerebras',
  models: CEREBRAS_MODELS,
  description: 'Cerebras 极速推理平台，基于晶圆级计算引擎',
  website: 'https://cerebras.ai',
  auth: [
    {
      methodId: 'api-key',
      label: 'Cerebras API Key',
      hint: '从 cloud.cerebras.ai 获取',
      envVar: 'CEREBRAS_API_KEY',
      flagName: '--cerebras-api-key',
      optionKey: 'cerebrasApiKey',
      promptMessage: '请输入 Cerebras API Key',
      defaultModel: 'llama-3.3-70b',
    },
  ],
};

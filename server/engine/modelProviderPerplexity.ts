/**
 * Perplexity 模型提供商
 *
 * baseUrl: https://api.perplexity.ai
 * authType: bearer
 *
 * Perplexity 专注于 AI 搜索增强生成，支持联网搜索：
 * - Sonar（搜索增强对话）
 * - Sonar Pro（深度搜索）
 * - Sonar Reasoning（推理搜索）
 */

import type { ProviderInfo, ModelInfo } from './modelCatalog.js';

/** Perplexity 模型列表 */
const PERPLEXITY_MODELS: ModelInfo[] = [
  {
    id: 'sonar',
    name: 'Sonar',
    provider: 'perplexity',
    description: 'Perplexity Sonar，搜索增强对话模型',
    contextWindow: 127_000,
    maxTokens: 8_192,
    input: ['text'],
    capabilities: ['search', 'general'],
    supportsTools: false,
    supportsStreaming: true,
    apiType: 'openai-chat',
    isRecommended: true,
    pricing: {
      isFree: false,
      inputPerMillion: 1.0,
      outputPerMillion: 1.0,
      note: '按搜索 + 生成计费',
    },
  },
  {
    id: 'sonar-pro',
    name: 'Sonar Pro',
    provider: 'perplexity',
    description: 'Perplexity Sonar Pro，深度搜索增强',
    contextWindow: 200_000,
    maxTokens: 8_192,
    input: ['text'],
    capabilities: ['search', 'reasoning', 'general'],
    supportsTools: false,
    supportsStreaming: true,
    apiType: 'openai-chat',
    pricing: {
      isFree: false,
      inputPerMillion: 3.0,
      outputPerMillion: 15.0,
    },
  },
  {
    id: 'sonar-reasoning',
    name: 'Sonar Reasoning',
    provider: 'perplexity',
    description: 'Perplexity Sonar Reasoning，推理 + 搜索',
    contextWindow: 127_000,
    maxTokens: 8_192,
    input: ['text'],
    capabilities: ['search', 'reasoning', 'general'],
    supportsTools: false,
    supportsStreaming: true,
    apiType: 'openai-chat',
    reasoning: true,
    pricing: {
      isFree: false,
      inputPerMillion: 1.0,
      outputPerMillion: 5.0,
    },
  },
  {
    id: 'sonar-reasoning-pro',
    name: 'Sonar Reasoning Pro',
    provider: 'perplexity',
    description: 'Perplexity Sonar Reasoning Pro，高级推理搜索',
    contextWindow: 127_000,
    maxTokens: 8_192,
    input: ['text'],
    capabilities: ['search', 'reasoning', 'general'],
    supportsTools: false,
    supportsStreaming: true,
    apiType: 'openai-chat',
    reasoning: true,
    pricing: {
      isFree: false,
      inputPerMillion: 2.0,
      outputPerMillion: 8.0,
    },
  },
];

/** Perplexity 提供商信息 */
export const PERPLEXITY_PROVIDER: ProviderInfo = {
  id: 'perplexity',
  name: 'Perplexity',
  baseUrl: 'https://api.perplexity.ai',
  authType: 'bearer',
  categories: ['cloud', 'llm', 'international', 'search'],
  docsPath: '/providers/perplexity',
  models: PERPLEXITY_MODELS,
  description: 'Perplexity 搜索增强 AI 平台',
  website: 'https://perplexity.ai',
  auth: [
    {
      methodId: 'api-key',
      label: 'Perplexity API Key',
      hint: '从 docs.perplexity.ai 获取',
      envVar: 'PERPLEXITY_API_KEY',
      flagName: '--perplexity-api-key',
      optionKey: 'perplexityApiKey',
      promptMessage: '请输入 Perplexity API Key',
      defaultModel: 'sonar',
    },
  ],
};

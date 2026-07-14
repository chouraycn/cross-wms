/**
 * Groq 模型提供商
 *
 * baseUrl: https://api.groq.com/openai
 * authType: bearer
 *
 * Groq 以极速推理著称，支持多种开源模型：
 * - Llama 3.3 70B Versatile
 * - Mixtral 8x7B
 * - Gemma 2
 */

import type { ProviderInfo, ModelInfo } from './modelCatalog.js';
import { PROVIDER_ENDPOINTS } from '../../shared/data/providerEndpoints.js';

/** Groq 模型列表 */
const GROQ_MODELS: ModelInfo[] = [
  {
    id: 'llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B Versatile',
    provider: 'groq',
    description: 'Groq Llama 3.3 70B，极速推理',
    contextWindow: 128_000,
    maxTokens: 8_192,
    input: ['text', 'image'],
    capabilities: ['fast', 'general', 'reasoning'],
    supportsTools: true,
    supportsStreaming: true,
    supportsFunctionCall: true,
    apiType: 'openai-chat',
    isRecommended: true,
    pricing: {
      isFree: true,
      note: 'Groq 免费层有速率限制',
    },
  },
  {
    id: 'llama-3.1-70b-versatile',
    name: 'Llama 3.1 70B Versatile',
    provider: 'groq',
    description: 'Groq Llama 3.1 70B，极速推理',
    contextWindow: 128_000,
    maxTokens: 8_192,
    input: ['text'],
    capabilities: ['fast', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-chat',
    pricing: { isFree: true },
  },
  {
    id: 'llama-3.1-8b-instant',
    name: 'Llama 3.1 8B Instant',
    provider: 'groq',
    description: 'Groq Llama 3.1 8B，最快轻量',
    contextWindow: 8_000,
    maxTokens: 8_192,
    input: ['text'],
    capabilities: ['fast', 'costEffective', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-chat',
    pricing: { isFree: true },
  },
  {
    id: 'mixtral-8x7b-32768',
    name: 'Mixtral 8x7B',
    provider: 'groq',
    description: 'Groq Mixtral 8x7B，混合专家模型',
    contextWindow: 32_768,
    maxTokens: 8_192,
    input: ['text'],
    capabilities: ['general', 'fast'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-chat',
    pricing: { isFree: true },
  },
  {
    id: 'gemma2-9b-it',
    name: 'Gemma 2 9B',
    provider: 'groq',
    description: 'Groq Gemma 2 9B，Google 开源模型',
    contextWindow: 8_000,
    maxTokens: 8_192,
    input: ['text'],
    capabilities: ['fast', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-chat',
    pricing: { isFree: true },
  },
  {
    id: 'deepseek-r1-distill-llama-70b',
    name: 'DeepSeek R1 Distill Llama 70B',
    provider: 'groq',
    description: 'Groq DeepSeek R1 Distill，推理模型',
    contextWindow: 128_000,
    maxTokens: 8_192,
    input: ['text'],
    capabilities: ['reasoning', 'fast', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-chat',
    reasoning: true,
    pricing: { isFree: true },
  },
];

/** Groq 提供商信息 */
export const GROQ_PROVIDER: ProviderInfo = {
  id: 'groq',
  name: 'Groq',
  baseUrl: PROVIDER_ENDPOINTS.groq,
  authType: 'bearer',
  categories: ['cloud', 'llm', 'international', 'fast'],
  docsPath: '/providers/groq',
  models: GROQ_MODELS,
  description: 'Groq 极速推理平台，免费层可用',
  website: 'https://groq.com',
  auth: [
    {
      methodId: 'api-key',
      label: 'Groq API Key',
      hint: '从 Groq Cloud 获取',
      envVar: 'GROQ_API_KEY',
      flagName: '--groq-api-key',
      optionKey: 'groqApiKey',
      promptMessage: '请输入 Groq API Key',
      defaultModel: 'llama-3.3-70b-versatile',
    },
  ],
};
/**
 * Mistral 模型提供商
 *
 * baseUrl: https://api.mistral.ai
 * authType: bearer
 *
 * Mistral 系列模型：
 * - Mistral Small Latest（支持 reasoning_effort）
 * - Mistral Medium 3.5（支持 reasoning_effort）
 * - Codestral（代码专用）
 */

import type { ProviderInfo, ModelInfo, ThinkingProfile } from './modelCatalog.js';

/** Mistral 思考模式级别 */
const MISTRAL_THINKING_LEVELS = [
  { id: 'off', label: '关闭', description: '不使用推理模式' },
  { id: 'high', label: '高', description: '高推理预算' },
] as const;

/** Mistral 思考模式配置 */
const MISTRAL_THINKING_PROFILE: ThinkingProfile = {
  levels: [...MISTRAL_THINKING_LEVELS],
  defaultLevel: 'off',
};

/** Mistral 模型列表 */
const MISTRAL_MODELS: ModelInfo[] = [
  {
    id: 'mistral-small-latest',
    name: 'Mistral Small Latest',
    provider: 'mistral',
    description: 'Mistral Small Latest，轻量推理',
    contextWindow: 128_000,
    maxTokens: 8_192,
    input: ['text', 'image'],
    capabilities: ['fast', 'costEffective', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    supportsFunctionCall: true,
    apiType: 'openai-completions',
    thinkingProfile: MISTRAL_THINKING_PROFILE,
    reasoning: true,
    pricing: {
      inputPerMillion: 0.1,
      outputPerMillion: 0.3,
    },
    aliases: ['mistral-small-2501'],
  },
  {
    id: 'mistral-medium-3-5',
    name: 'Mistral Medium 3.5',
    provider: 'mistral',
    description: 'Mistral Medium 3.5，中等推理',
    contextWindow: 128_000,
    maxTokens: 8_192,
    input: ['text', 'image'],
    capabilities: ['reasoning', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    supportsFunctionCall: true,
    apiType: 'openai-completions',
    thinkingProfile: MISTRAL_THINKING_PROFILE,
    reasoning: true,
    pricing: {
      inputPerMillion: 0.4,
      outputPerMillion: 2,
    },
    aliases: ['mistral-medium-2505'],
  },
  {
    id: 'codestral-2501',
    name: 'Codestral',
    provider: 'mistral',
    description: 'Mistral Codestral，代码专用模型',
    contextWindow: 256_000,
    maxTokens: 32_768,
    input: ['text'],
    capabilities: ['code', 'fast', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    supportsFunctionCall: true,
    apiType: 'openai-completions',
    pricing: {
      inputPerMillion: 0.3,
      outputPerMillion: 0.9,
    },
    aliases: ['codestral-latest'],
  },
  {
    id: 'mistral-large-latest',
    name: 'Mistral Large Latest',
    provider: 'mistral',
    description: 'Mistral Large Latest，最强推理',
    contextWindow: 128_000,
    maxTokens: 8_192,
    input: ['text', 'image'],
    capabilities: ['reasoning', 'code', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    supportsFunctionCall: true,
    apiType: 'openai-completions',
    pricing: {
      inputPerMillion: 2,
      outputPerMillion: 6,
    },
  },
];

/** Mistral 提供商信息 */
export const MISTRAL_PROVIDER: ProviderInfo = {
  id: 'mistral',
  name: 'Mistral',
  baseUrl: 'https://api.mistral.ai/v1',
  authType: 'bearer',
  categories: ['cloud', 'llm', 'international', 'reasoning'],
  docsPath: '/providers/mistral',
  models: MISTRAL_MODELS,
  description: 'Mistral 系列模型，欧洲 AI 公司',
  website: 'https://mistral.ai',
  allowCustomBaseUrl: true,
  auth: [
    {
      methodId: 'api-key',
      label: 'Mistral API Key',
      hint: '从 Mistral 平台获取',
      envVar: 'MISTRAL_API_KEY',
      flagName: '--mistral-api-key',
      optionKey: 'mistralApiKey',
      promptMessage: '请输入 Mistral API Key',
      defaultModel: 'mistral-small-latest',
    },
  ],
};
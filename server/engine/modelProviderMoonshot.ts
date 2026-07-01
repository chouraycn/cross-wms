/**
 * Moonshot (Kimi) 模型提供商
 *
 * baseUrl: https://api.moonshot.cn
 * authType: bearer
 *
 * Moonshot 系列模型（月之暗面 Kimi）：
 * - Kimi K2.6（多模态 + 思考模式）
 * - Kimi K2.7 Code（最强编码）
 * - Moonshot V1 128K
 */

import type { ProviderInfo, ModelInfo, ThinkingProfile } from './modelCatalog.js';

/** Kimi 思考模式级别 */
const KIMI_THINKING_LEVELS = [
  { id: 'off', label: '关闭', description: '不使用思考模式' },
  { id: 'minimal', label: '最小', description: '最少思考预算' },
  { id: 'low', label: '低', description: '低思考预算' },
  { id: 'medium', label: '中等', description: '中等思考预算' },
  { id: 'high', label: '高', description: '高思考预算（推荐）' },
] as const;

/** Kimi 思考模式配置 */
const KIMI_THINKING_PROFILE: ThinkingProfile = {
  levels: [...KIMI_THINKING_LEVELS],
  defaultLevel: 'high',
};

/** Moonshot 模型列表 */
const MOONSHOT_MODELS: ModelInfo[] = [
  {
    id: 'kimi-k2.6',
    name: 'Kimi K2.6',
    provider: 'kimi',
    description: 'Kimi 最智能通用模型，多模态 + 思考模式',
    contextWindow: 262_144,
    maxTokens: 8_192,
    input: ['text', 'image'],
    capabilities: ['multimodal', 'reasoning', 'general', 'longContext'],
    supportsTools: true,
    supportsStreaming: true,
    supportsFunctionCall: true,
    apiType: 'openai-completions',
    thinkingProfile: KIMI_THINKING_PROFILE,
    reasoning: true,
    isRecommended: true,
    pricing: {
      inputPerMillion: 2,
      outputPerMillion: 10,
    },
  },
  {
    id: 'kimi-k2.7-code',
    name: 'Kimi K2.7 Code',
    provider: 'kimi',
    description: 'Kimi 最强编码模型，256K 上下文',
    contextWindow: 262_144,
    maxTokens: 8_192,
    input: ['text', 'image'],
    capabilities: ['code', 'reasoning', 'general', 'longContext'],
    supportsTools: true,
    supportsStreaming: true,
    supportsFunctionCall: true,
    apiType: 'openai-completions',
    reasoning: true,
    isRecommended: true,
    pricing: {
      inputPerMillion: 2,
      outputPerMillion: 10,
    },
  },
  {
    id: 'moonshot-v1-128k',
    name: 'Moonshot V1 128K',
    provider: 'kimi',
    description: 'Kimi Moonshot V1，128K 长文本',
    contextWindow: 128_000,
    maxTokens: 8_192,
    input: ['text'],
    capabilities: ['longContext', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-completions',
    pricing: {
      inputPerMillion: 2,
      outputPerMillion: 2,
    },
  },
  {
    id: 'moonshot-v1-32k',
    name: 'Moonshot V1 32K',
    provider: 'kimi',
    description: 'Kimi Moonshot V1，32K 快速',
    contextWindow: 32_000,
    maxTokens: 8_192,
    input: ['text'],
    capabilities: ['fast', 'costEffective', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-completions',
    pricing: {
      inputPerMillion: 0.5,
      outputPerMillion: 0.5,
    },
  },
  {
    id: 'moonshot-v1-8k',
    name: 'Moonshot V1 8K',
    provider: 'kimi',
    description: 'Kimi Moonshot V1，8K 轻量',
    contextWindow: 8_000,
    maxTokens: 4_096,
    input: ['text'],
    capabilities: ['fast', 'costEffective', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-completions',
    pricing: {
      inputPerMillion: 0.12,
      outputPerMillion: 0.12,
    },
  },
];

/** Moonshot 提供商信息 */
export const MOONSHOT_PROVIDER: ProviderInfo = {
  id: 'kimi',
  name: 'Moonshot (Kimi)',
  baseUrl: 'https://api.moonshot.cn/v1',
  authType: 'bearer',
  categories: ['cloud', 'llm', 'chinese', 'reasoning'],
  docsPath: '/providers/moonshot',
  models: MOONSHOT_MODELS,
  description: '月之暗面 Kimi 系列模型，擅长长文本',
  website: 'https://moonshot.cn',
  auth: [
    {
      methodId: 'api-key',
      label: 'Moonshot API Key',
      hint: '从 Moonshot 平台获取',
      envVar: 'MOONSHOT_API_KEY',
      flagName: '--moonshot-api-key',
      optionKey: 'moonshotApiKey',
      promptMessage: '请输入 Moonshot API Key',
      defaultModel: 'kimi-k2.6',
    },
  ],
};
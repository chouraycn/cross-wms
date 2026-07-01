/**
 * OpenAI 模型提供商
 *
 * baseUrl: https://api.openai.com
 * authType: bearer
 *
 * OpenAI 系列模型：
 * - GPT-4o（多模态）
 * - GPT-4o Mini（轻量）
 * - o3（深度推理）
 * - o3-mini（轻量推理）
 */

import type { ProviderInfo, ModelInfo, ThinkingProfile } from './modelCatalog.js';

/** OpenAI o 系列 思考模式级别 */
const OPENAI_O_THINKING_LEVELS = [
  { id: 'off', label: '关闭', description: '不使用推理模式' },
  { id: 'low', label: '低', description: '低推理预算' },
  { id: 'medium', label: '中等', description: '中等推理预算' },
  { id: 'high', label: '高', description: '高推理预算（推荐）' },
] as const;

/** OpenAI o 系列思考模式配置 */
const OPENAI_O_THINKING_PROFILE: ThinkingProfile = {
  levels: [...OPENAI_O_THINKING_LEVELS],
  defaultLevel: 'high',
};

/** OpenAI 模型列表 */
const OPENAI_MODELS: ModelInfo[] = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    description: 'OpenAI GPT-4o，多模态、推理、128K 上下文',
    contextWindow: 128_000,
    maxTokens: 16_384,
    input: ['text', 'image', 'audio'],
    capabilities: ['multimodal', 'reasoning', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    supportsFunctionCall: true,
    apiType: 'openai-completions',
    isRecommended: true,
    pricing: {
      inputPerMillion: 2.5,
      outputPerMillion: 10,
    },
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    description: 'OpenAI GPT-4o Mini，轻量快速、高性价比',
    contextWindow: 128_000,
    maxTokens: 16_384,
    input: ['text', 'image'],
    capabilities: ['fast', 'costEffective', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    supportsFunctionCall: true,
    apiType: 'openai-completions',
    isRecommended: true,
    pricing: {
      inputPerMillion: 0.15,
      outputPerMillion: 0.6,
    },
  },
  {
    id: 'o3',
    name: 'OpenAI o3',
    provider: 'openai',
    description: 'OpenAI o3，深度推理模型',
    contextWindow: 200_000,
    maxTokens: 100_000,
    input: ['text'],
    capabilities: ['reasoning', 'code', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-completions',
    thinkingProfile: OPENAI_O_THINKING_PROFILE,
    reasoning: true,
    pricing: {
      inputPerMillion: 10,
      outputPerMillion: 40,
    },
  },
  {
    id: 'o3-mini',
    name: 'OpenAI o3 Mini',
    provider: 'openai',
    description: 'OpenAI o3 Mini，轻量推理模型',
    contextWindow: 200_000,
    maxTokens: 65_536,
    input: ['text'],
    capabilities: ['reasoning', 'fast', 'costEffective', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-completions',
    thinkingProfile: OPENAI_O_THINKING_PROFILE,
    reasoning: true,
    isRecommended: true,
    pricing: {
      inputPerMillion: 1.1,
      outputPerMillion: 4.4,
    },
  },
  {
    id: 'o4-mini',
    name: 'OpenAI o4 Mini',
    provider: 'openai',
    description: 'OpenAI o4 Mini，最新轻量推理模型',
    contextWindow: 200_000,
    maxTokens: 100_000,
    input: ['text'],
    capabilities: ['reasoning', 'fast', 'code', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-completions',
    thinkingProfile: OPENAI_O_THINKING_PROFILE,
    reasoning: true,
    pricing: {
      inputPerMillion: 1.1,
      outputPerMillion: 4.4,
    },
  },
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    provider: 'openai',
    description: 'OpenAI GPT-4 Turbo，稳定版',
    contextWindow: 128_000,
    maxTokens: 4_096,
    input: ['text', 'image'],
    capabilities: ['general', 'reasoning'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-completions',
    pricing: {
      inputPerMillion: 10,
      outputPerMillion: 30,
    },
    aliases: ['gpt-4-1106-preview'],
  },
];

/** OpenAI 提供商信息 */
export const OPENAI_PROVIDER: ProviderInfo = {
  id: 'openai',
  name: 'OpenAI',
  baseUrl: 'https://api.openai.com/v1',
  authType: 'bearer',
  categories: ['cloud', 'llm', 'international', 'multimodal', 'reasoning'],
  docsPath: '/providers/openai',
  models: OPENAI_MODELS,
  description: 'OpenAI GPT 系列模型，o 系列支持推理',
  website: 'https://openai.com',
  auth: [
    {
      methodId: 'api-key',
      label: 'OpenAI API Key',
      hint: '从 OpenAI Platform 获取',
      envVar: 'OPENAI_API_KEY',
      flagName: '--openai-api-key',
      optionKey: 'openaiApiKey',
      promptMessage: '请输入 OpenAI API Key',
      defaultModel: 'gpt-4o-mini',
    },
  ],
};
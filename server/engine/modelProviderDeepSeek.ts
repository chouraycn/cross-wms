/**
 * DeepSeek 模型提供商
 *
 * baseUrl: https://api.deepseek.com
 * authType: bearer
 *
 * DeepSeek 系列模型：
 * - DeepSeek V4 Pro（支持 thinking）
 * - DeepSeek V4 Flash（支持 thinking）
 * - DeepSeek R1（推理模型）
 */

import type { ProviderInfo, ModelInfo, ThinkingProfile } from './modelCatalog.js';

/** DeepSeek V4 思考模式级别 */
const DEEPSEEK_V4_THINKING_LEVELS = [
  { id: 'off', label: '关闭', description: '不使用思考模式' },
  { id: 'minimal', label: '最小', description: '最少思考预算' },
  { id: 'low', label: '低', description: '低思考预算' },
  { id: 'medium', label: '中等', description: '中等思考预算' },
  { id: 'high', label: '高', description: '高思考预算（推荐）' },
  { id: 'xhigh', label: '超高', description: '超高思考预算' },
  { id: 'max', label: '最大', description: '最大思考预算' },
] as const;

/** DeepSeek V4 思考模式配置 */
const DEEPSEEK_V4_THINKING_PROFILE: ThinkingProfile = {
  levels: [...DEEPSEEK_V4_THINKING_LEVELS],
  defaultLevel: 'high',
};

/** DeepSeek 模型列表 */
const DEEPSEEK_MODELS: ModelInfo[] = [
  {
    id: 'deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    provider: 'deepseek',
    description: 'DeepSeek V4 Pro，1M 上下文、工具调用、推理',
    contextWindow: 1_000_000,
    maxTokens: 8_192,
    input: ['text'],
    capabilities: ['reasoning', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    supportsFunctionCall: true,
    apiType: 'openai-chat',
    thinkingProfile: DEEPSEEK_V4_THINKING_PROFILE,
    reasoning: true,
    isRecommended: true,
    pricing: {
      inputPerMillion: 0.5,
      outputPerMillion: 2,
    },
    aliases: ['deepseek-v4'],
  },
  {
    id: 'deepseek-v4-flash',
    name: 'DeepSeek V4 Flash',
    provider: 'deepseek',
    description: 'DeepSeek V4 Flash，1M 上下文、工具调用，高性价比',
    contextWindow: 1_000_000,
    maxTokens: 8_192,
    input: ['text'],
    capabilities: ['costEffective', 'fast', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    supportsFunctionCall: true,
    apiType: 'openai-chat',
    thinkingProfile: DEEPSEEK_V4_THINKING_PROFILE,
    reasoning: true,
    isRecommended: true,
    pricing: {
      inputPerMillion: 0.1,
      outputPerMillion: 0.5,
    },
  },
  {
    id: 'deepseek-chat',
    name: 'DeepSeek Chat',
    provider: 'deepseek',
    description: 'DeepSeek Chat，通用对话模型',
    contextWindow: 128_000,
    maxTokens: 8_192,
    input: ['text'],
    capabilities: ['general', 'fast'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-chat',
    pricing: {
      inputPerMillion: 0.14,
      outputPerMillion: 0.28,
    },
    aliases: ['deepseek-v3'],
  },
  {
    id: 'deepseek-reasoner',
    name: 'DeepSeek Reasoner',
    provider: 'deepseek',
    description: 'DeepSeek R1 推理模型，深度思考',
    contextWindow: 128_000,
    maxTokens: 8_192,
    input: ['text'],
    capabilities: ['reasoning', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-chat',
    reasoning: true,
    pricing: {
      inputPerMillion: 0.55,
      outputPerMillion: 2.19,
    },
    aliases: ['deepseek-r1'],
  },
];

/** DeepSeek 提供商信息 */
export const DEEPSEEK_PROVIDER: ProviderInfo = {
  id: 'deepseek',
  name: 'DeepSeek',
  baseUrl: 'https://api.deepseek.com/v1',
  authType: 'bearer',
  categories: ['cloud', 'llm', 'chinese', 'reasoning'],
  docsPath: '/providers/deepseek',
  models: DEEPSEEK_MODELS,
  description: 'DeepSeek 系列模型，支持思考模式，性价比高',
  website: 'https://deepseek.com',
  auth: [
    {
      methodId: 'api-key',
      label: 'DeepSeek API Key',
      hint: '从 DeepSeek 平台获取',
      envVar: 'DEEPSEEK_API_KEY',
      flagName: '--deepseek-api-key',
      optionKey: 'deepseekApiKey',
      promptMessage: '请输入 DeepSeek API Key',
      defaultModel: 'deepseek-v4-flash',
    },
  ],
};
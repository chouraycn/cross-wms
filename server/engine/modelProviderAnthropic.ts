/**
 * Anthropic 模型提供商
 *
 * baseUrl: https://api.anthropic.com
 * authType: x-api-key
 *
 * Claude 系列模型：
 * - Claude 3.5 Sonnet（支持 thinking）
 * - Claude 3.5 Haiku
 * - Claude Sonnet 4（最新）
 * - Claude Opus 4（最强推理）
 */

import type { ProviderInfo, ModelInfo, ThinkingProfile } from './modelCatalog.js';
import { PROVIDER_ENDPOINTS } from '../../shared/data/providerEndpoints.js';

/** Claude 思考模式级别 */
const CLAUDE_THINKING_LEVELS = [
  { id: 'off', label: '关闭', description: '不使用思考模式' },
  { id: 'minimal', label: '最小', description: '最少思考预算' },
  { id: 'low', label: '低', description: '低思考预算' },
  { id: 'medium', label: '中等', description: '中等思考预算' },
  { id: 'high', label: '高', description: '高思考预算（推荐）' },
] as const;

/** Claude 思考模式配置 */
const CLAUDE_THINKING_PROFILE: ThinkingProfile = {
  levels: [...CLAUDE_THINKING_LEVELS],
  defaultLevel: 'high',
};

/** Claude 模型列表 */
const CLAUDE_MODELS: ModelInfo[] = [
  {
    id: 'claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    description: 'Anthropic Claude 3.5 Sonnet，代码与长文本',
    contextWindow: 200_000,
    maxTokens: 8_192,
    input: ['text', 'image'],
    capabilities: ['code', 'longContext', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    supportsFunctionCall: true,
    apiType: 'anthropic-messages',
    pricing: {
      inputPerMillion: 3,
      outputPerMillion: 15,
    },
  },
  {
    id: 'claude-3-5-haiku-20241022',
    name: 'Claude 3.5 Haiku',
    provider: 'anthropic',
    description: 'Anthropic Claude 3.5 Haiku，快速轻量',
    contextWindow: 200_000,
    maxTokens: 8_192,
    input: ['text', 'image'],
    capabilities: ['fast', 'costEffective', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    supportsFunctionCall: true,
    apiType: 'anthropic-messages',
    pricing: {
      inputPerMillion: 1,
      outputPerMillion: 5,
    },
  },
  {
    id: 'claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    provider: 'anthropic',
    description: 'Anthropic Claude Sonnet 4，推理、代码、200K 上下文',
    contextWindow: 200_000,
    maxTokens: 64_000,
    input: ['text', 'image'],
    capabilities: ['reasoning', 'code', 'longContext', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    supportsFunctionCall: true,
    apiType: 'anthropic-messages',
    thinkingProfile: CLAUDE_THINKING_PROFILE,
    reasoning: true,
    isRecommended: true,
    pricing: {
      inputPerMillion: 3,
      outputPerMillion: 15,
    },
  },
  {
    id: 'claude-opus-4-20250514',
    name: 'Claude Opus 4',
    provider: 'anthropic',
    description: 'Anthropic Claude Opus 4，最强推理与代码能力',
    contextWindow: 200_000,
    maxTokens: 32_000,
    input: ['text', 'image'],
    capabilities: ['reasoning', 'code', 'longContext', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    supportsFunctionCall: true,
    apiType: 'anthropic-messages',
    thinkingProfile: CLAUDE_THINKING_PROFILE,
    reasoning: true,
    pricing: {
      inputPerMillion: 15,
      outputPerMillion: 75,
    },
  },
  {
    id: 'claude-3-opus-20240229',
    name: 'Claude 3 Opus',
    provider: 'anthropic',
    description: 'Anthropic Claude 3 Opus，最强智能',
    contextWindow: 200_000,
    maxTokens: 4_096,
    input: ['text', 'image'],
    capabilities: ['reasoning', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'anthropic-messages',
    pricing: {
      inputPerMillion: 15,
      outputPerMillion: 75,
    },
  },
];

/** Anthropic 提供商信息 */
export const ANTHROPIC_PROVIDER: ProviderInfo = {
  id: 'anthropic',
  name: 'Anthropic',
  baseUrl: PROVIDER_ENDPOINTS.anthropic,
  authType: 'x-api-key',
  categories: ['cloud', 'llm', 'international', 'reasoning'],
  docsPath: '/providers/anthropic',
  models: CLAUDE_MODELS,
  description: 'Anthropic Claude 系列模型，支持思考模式',
  website: 'https://anthropic.com',
  auth: [
    {
      methodId: 'api-key',
      label: 'Anthropic API Key',
      hint: '从 Anthropic Console 获取',
      envVar: 'ANTHROPIC_API_KEY',
      flagName: '--anthropic-api-key',
      optionKey: 'anthropicApiKey',
      promptMessage: '请输入 Anthropic API Key',
      defaultModel: 'claude-sonnet-4-20250514',
    },
  ],
};
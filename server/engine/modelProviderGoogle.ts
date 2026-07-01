/**
 * Google 模型提供商
 *
 * baseUrl: https://generativelanguage.googleapis.com
 * authType: api-key
 *
 * Gemini 系列模型：
 * - Gemini 2.5 Pro（支持 thinking）
 * - Gemini 2.5 Flash（支持 thinking）
 * - Gemini 2.0 Flash
 */

import type { ProviderInfo, ModelInfo, ThinkingProfile } from './modelCatalog.js';

/** Gemini 思考模式级别 */
const GEMINI_THINKING_LEVELS = [
  { id: 'off', label: '关闭', description: '不使用思考模式' },
  { id: 'minimal', label: '最小', description: '最少思考预算' },
  { id: 'low', label: '低', description: '低思考预算' },
  { id: 'medium', label: '中等', description: '中等思考预算' },
  { id: 'high', label: '高', description: '高思考预算（推荐）' },
  { id: 'max', label: '最大', description: '最大思考预算' },
] as const;

/** Gemini 思考模式配置 */
const GEMINI_THINKING_PROFILE: ThinkingProfile = {
  levels: [...GEMINI_THINKING_LEVELS],
  defaultLevel: 'high',
};

/** Gemini 模型列表 */
const GEMINI_MODELS: ModelInfo[] = [
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'google',
    description: 'Google Gemini 2.5 Pro，1M 上下文、推理、多模态',
    contextWindow: 1_000_000,
    maxTokens: 65_536,
    input: ['text', 'image', 'audio', 'video', 'pdf'],
    capabilities: ['reasoning', 'multimodal', 'longContext', 'code', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    supportsFunctionCall: true,
    apiType: 'google-gemini',
    thinkingProfile: GEMINI_THINKING_PROFILE,
    reasoning: true,
    isRecommended: true,
    pricing: {
      inputPerMillion: 1.25,
      outputPerMillion: 10,
    },
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'google',
    description: 'Google Gemini 2.5 Flash，1M 上下文、快速、高性价比',
    contextWindow: 1_000_000,
    maxTokens: 65_536,
    input: ['text', 'image', 'audio', 'video', 'pdf'],
    capabilities: ['fast', 'multimodal', 'longContext', 'costEffective', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    supportsFunctionCall: true,
    apiType: 'google-gemini',
    thinkingProfile: GEMINI_THINKING_PROFILE,
    reasoning: true,
    isRecommended: true,
    pricing: {
      inputPerMillion: 0.075,
      outputPerMillion: 0.3,
    },
  },
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'google',
    description: 'Google Gemini 2.0 Flash，多模态、快速',
    contextWindow: 1_000_000,
    maxTokens: 8_192,
    input: ['text', 'image', 'audio', 'video'],
    capabilities: ['fast', 'multimodal', 'costEffective', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    supportsFunctionCall: true,
    apiType: 'google-gemini',
    pricing: {
      inputPerMillion: 0.1,
      outputPerMillion: 0.4,
    },
  },
  {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    provider: 'google',
    description: 'Google Gemini 1.5 Pro，稳定版多模态',
    contextWindow: 2_000_000,
    maxTokens: 8_192,
    input: ['text', 'image', 'audio', 'video', 'pdf'],
    capabilities: ['multimodal', 'longContext', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'google-gemini',
    pricing: {
      inputPerMillion: 1.25,
      outputPerMillion: 5,
    },
  },
  {
    id: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    provider: 'google',
    description: 'Google Gemini 1.5 Flash，稳定版快速',
    contextWindow: 1_000_000,
    maxTokens: 8_192,
    input: ['text', 'image', 'audio', 'video'],
    capabilities: ['fast', 'multimodal', 'costEffective', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'google-gemini',
    pricing: {
      inputPerMillion: 0.075,
      outputPerMillion: 0.3,
    },
  },
];

/** Google 提供商信息 */
export const GOOGLE_PROVIDER: ProviderInfo = {
  id: 'google',
  name: 'Google',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
  authType: 'api-key',
  categories: ['cloud', 'llm', 'international', 'multimodal', 'reasoning'],
  docsPath: '/providers/google',
  models: GEMINI_MODELS,
  description: 'Google Gemini 系列模型，支持多模态和思考模式',
  website: 'https://ai.google.dev',
  auth: [
    {
      methodId: 'api-key',
      label: 'Google API Key',
      hint: '从 Google AI Studio 获取',
      envVar: 'GOOGLE_API_KEY',
      flagName: '--google-api-key',
      optionKey: 'googleApiKey',
      promptMessage: '请输入 Google API Key',
      defaultModel: 'gemini-2.5-flash',
    },
    {
      methodId: 'gemini-api-key',
      label: 'Gemini API Key',
      hint: '专用 Gemini API Key',
      envVar: 'GEMINI_API_KEY',
      flagName: '--gemini-api-key',
      optionKey: 'geminiApiKey',
      promptMessage: '请输入 Gemini API Key',
      defaultModel: 'gemini-2.5-flash',
    },
  ],
};
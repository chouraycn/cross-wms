/**
 * MiniMax 模型提供商
 *
 * baseUrl: https://api.minimax.chat
 * authType: bearer
 *
 * MiniMax 系列模型：
 * - MiniMax M3（MSA 稀疏注意力，1M 上下文）
 * - MiniMax M2.5（MOE 架构）
 * - MiniMax Text-01（4M 超长上下文）
 */

import type { ProviderInfo, ModelInfo } from './modelCatalog.js';

/** MiniMax 模型列表 */
const MINIMAX_MODELS: ModelInfo[] = [
  {
    id: 'minimax-m3',
    name: 'MiniMax M3',
    provider: 'minimax',
    description: 'MiniMax M3 旗舰模型，MSA稀疏注意力架构，1M上下文，原生多模态',
    contextWindow: 1_000_000,
    maxTokens: 32_768,
    input: ['text', 'image', 'audio'],
    capabilities: ['reasoning', 'code', 'multimodal', 'general', 'longContext'],
    supportsTools: true,
    supportsStreaming: true,
    supportsFunctionCall: true,
    apiType: 'openai-completions',
    isRecommended: true,
    pricing: {
      inputPerMillion: 0.3,
      outputPerMillion: 1.2,
    },
  },
  {
    id: 'minimax-m2.5',
    name: 'MiniMax M2.5',
    provider: 'minimax',
    description: 'MiniMax M2.5，MOE架构，128K上下文，均衡能力',
    contextWindow: 128_000,
    maxTokens: 8_192,
    input: ['text'],
    capabilities: ['reasoning', 'general', 'costEffective'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-completions',
    pricing: {
      inputPerMillion: 0.2,
      outputPerMillion: 0.8,
    },
  },
  {
    id: 'minimax-m2.1',
    name: 'MiniMax M2.1',
    provider: 'minimax',
    description: 'MiniMax M2.1，开源模型，适合本地部署',
    contextWindow: 128_000,
    maxTokens: 4_096,
    input: ['text'],
    capabilities: ['general', 'costEffective'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-completions',
    pricing: {
      isFree: true,
      note: '开源模型，可本地部署',
    },
  },
  {
    id: 'MiniMax-Text-01',
    name: 'MiniMax Text-01',
    provider: 'minimax',
    description: 'MiniMax Text-01，4M 超长上下文',
    contextWindow: 4_000_000,
    maxTokens: 32_768,
    input: ['text'],
    capabilities: ['longContext', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-completions',
    pricing: {
      inputPerMillion: 0.3,
      outputPerMillion: 1.2,
    },
  },
];

/** MiniMax 提供商信息 */
export const MINIMAX_PROVIDER: ProviderInfo = {
  id: 'minimax',
  name: 'MiniMax',
  baseUrl: 'https://api.minimax.chat/v1',
  authType: 'bearer',
  categories: ['cloud', 'llm', 'chinese', 'longContext'],
  docsPath: '/providers/minimax',
  models: MINIMAX_MODELS,
  description: 'MiniMax 系列模型，超长上下文',
  website: 'https://minimax.chat',
  auth: [
    {
      methodId: 'api-key',
      label: 'MiniMax API Key',
      hint: '从 MiniMax 平台获取',
      envVar: 'MINIMAX_API_KEY',
      flagName: '--minimax-api-key',
      optionKey: 'minimaxApiKey',
      promptMessage: '请输入 MiniMax API Key',
      defaultModel: 'minimax-m3',
    },
  ],
};
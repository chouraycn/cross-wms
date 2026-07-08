/**
 * LiteLLM 聚合模型提供商
 *
 * baseUrl: 用户自定义（LiteLLM Proxy 地址）
 * authType: bearer
 *
 * LiteLLM 是统一的 LLM 代理网关，支持 100+ 模型提供商的统一 API：
 * - 通过 OpenAI 兼容接口代理所有提供商
 * - 支持 fallback、负载均衡、速率限制
 * - 自建部署或使用 LiteLLM Proxy
 */

import type { ProviderInfo, ModelInfo } from './modelCatalog.js';

/** LiteLLM 模型列表（动态发现，这里仅提供常见示例） */
const LITELLM_MODELS: ModelInfo[] = [
  {
    id: 'litellm-proxy-default',
    name: 'LiteLLM Proxy Default',
    provider: 'litellm',
    description: 'LiteLLM 代理默认模型，由 Proxy 配置决定',
    contextWindow: 128_000,
    maxTokens: 8_192,
    input: ['text'],
    capabilities: ['general', 'proxy'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-chat',
    isRecommended: true,
    pricing: {
      isFree: false,
      note: '取决于后端模型提供商定价',
    },
  },
];

/** LiteLLM 提供商信息 */
export const LITELLM_PROVIDER: ProviderInfo = {
  id: 'litellm',
  name: 'LiteLLM',
  baseUrl: 'http://localhost:4000', // 默认 LiteLLM Proxy 地址
  authType: 'bearer',
  categories: ['cloud', 'llm', 'proxy', 'international'],
  docsPath: '/providers/litellm',
  models: LITELLM_MODELS,
  description: 'LiteLLM 统一代理网关，支持 100+ 模型提供商',
  website: 'https://docs.litellm.ai',
  auth: [
    {
      methodId: 'api-key',
      label: 'LiteLLM API Key',
      hint: 'LiteLLM Proxy 的 API Key（可选）',
      envVar: 'LITELLM_API_KEY',
      flagName: '--litellm-api-key',
      optionKey: 'litellmApiKey',
      promptMessage: '请输入 LiteLLM API Key（如无需认证可留空）',
      defaultModel: 'litellm-proxy-default',
    },
    {
      methodId: 'base-url',
      label: 'LiteLLM Proxy URL',
      hint: 'LiteLLM Proxy 地址',
      envVar: 'LITELLM_BASE_URL',
      flagName: '--litellm-base-url',
      optionKey: 'litellmBaseUrl',
      promptMessage: '请输入 LiteLLM Proxy 地址',
    },
  ],
};

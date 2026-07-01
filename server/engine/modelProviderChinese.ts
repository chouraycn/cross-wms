/**
 * 中国模型提供商集合
 *
 * 包含：
 * - 智谱 AI（GLM 系列）
 * - 阿里通义千问（Qwen 系列）
 * - 腾讯混元
 * - 字节豆包（Volcengine）
 * - xAI Grok
 */

import type { ProviderInfo, ModelInfo } from './modelCatalog.js';

// ============================================================
// 智谱 AI (GLM)
// ============================================================

const GLM_MODELS: ModelInfo[] = [
  {
    id: 'glm-4.7',
    name: 'GLM-4.7',
    provider: 'bigmodel',
    description: '智谱 GLM-4.7，高智能 Agentic Coding 模型，200K 上下文',
    contextWindow: 200_000,
    maxTokens: 128_000,
    input: ['text'],
    capabilities: ['reasoning', 'code', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-completions',
    isRecommended: true,
    pricing: {
      inputPerMillion: 0.05,
      outputPerMillion: 0.05,
    },
  },
  {
    id: 'glm-4.7-flashx',
    name: 'GLM-4.7 FlashX',
    provider: 'bigmodel',
    description: '智谱 GLM-4.7 FlashX，轻量高速版，200K 上下文',
    contextWindow: 200_000,
    maxTokens: 128_000,
    input: ['text'],
    capabilities: ['fast', 'costEffective', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-completions',
    pricing: {
      inputPerMillion: 0.001,
      outputPerMillion: 0.001,
    },
  },
  {
    id: 'glm-5',
    name: 'GLM-5',
    provider: 'bigmodel',
    description: '智谱 GLM-5 旗舰模型，推理与代码',
    contextWindow: 128_000,
    maxTokens: 8_192,
    input: ['text'],
    capabilities: ['reasoning', 'code', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-completions',
    pricing: {
      inputPerMillion: 0.1,
      outputPerMillion: 0.1,
    },
  },
  {
    id: 'glm-5-turbo',
    name: 'GLM-5 Turbo',
    provider: 'bigmodel',
    description: '智谱 GLM-5 Turbo，极速版',
    contextWindow: 128_000,
    maxTokens: 8_192,
    input: ['text'],
    capabilities: ['fast', 'costEffective', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-completions',
    pricing: {
      inputPerMillion: 0.01,
      outputPerMillion: 0.01,
    },
  },
  {
    id: 'glm-4-plus',
    name: 'GLM-4 Plus',
    provider: 'bigmodel',
    description: '智谱 GLM-4 Plus，推理与代码',
    contextWindow: 128_000,
    maxTokens: 4_096,
    input: ['text'],
    capabilities: ['reasoning', 'code', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-completions',
    pricing: {
      inputPerMillion: 0.05,
      outputPerMillion: 0.05,
    },
  },
  {
    id: 'glm-4-flash',
    name: 'GLM-4 Flash',
    provider: 'bigmodel',
    description: '智谱 GLM-4 Flash，极速免费',
    contextWindow: 128_000,
    maxTokens: 4_096,
    input: ['text'],
    capabilities: ['fast', 'costEffective', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-completions',
    pricing: { isFree: true },
  },
  {
    id: 'glm-4v-plus',
    name: 'GLM-4V Plus',
    provider: 'bigmodel',
    description: '智谱 GLM-4V Plus，多模态理解',
    contextWindow: 8_000,
    maxTokens: 4_096,
    input: ['text', 'image'],
    capabilities: ['multimodal', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-completions',
    pricing: {
      inputPerMillion: 0.01,
      outputPerMillion: 0.01,
    },
  },
];

const BIGMODEL_PROVIDER: ProviderInfo = {
  id: 'bigmodel',
  name: '智谱 AI',
  baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  authType: 'bearer',
  categories: ['cloud', 'llm', 'chinese'],
  docsPath: '/providers/bigmodel',
  models: GLM_MODELS,
  description: '智谱 GLM 系列模型',
  website: 'https://bigmodel.cn',
  auth: [
    {
      methodId: 'api-key',
      label: '智谱 API Key',
      hint: '从智谱开放平台获取',
      envVar: 'BIGMODEL_API_KEY',
      flagName: '--bigmodel-api-key',
      optionKey: 'bigmodelApiKey',
      promptMessage: '请输入智谱 API Key',
      defaultModel: 'glm-4-flash',
    },
  ],
};

// ============================================================
// 阿里通义千问 (Qwen)
// ============================================================

const QWEN_MODELS: ModelInfo[] = [
  {
    id: 'qwen-max',
    name: 'Qwen Max',
    provider: 'qwen',
    description: '通义千问 Max，推理、代码、128K 上下文',
    contextWindow: 128_000,
    maxTokens: 32_768,
    input: ['text', 'image'],
    capabilities: ['reasoning', 'code', 'longContext', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-completions',
    isRecommended: true,
    pricing: {
      inputPerMillion: 2,
      outputPerMillion: 6,
    },
  },
  {
    id: 'qwen-plus',
    name: 'Qwen Plus',
    provider: 'qwen',
    description: '通义千问 Plus，均衡能力、高性价比',
    contextWindow: 128_000,
    maxTokens: 32_768,
    input: ['text', 'image'],
    capabilities: ['general', 'costEffective'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-completions',
    isRecommended: true,
    pricing: {
      inputPerMillion: 0.8,
      outputPerMillion: 2,
    },
  },
  {
    id: 'qwen-turbo',
    name: 'Qwen Turbo',
    provider: 'qwen',
    description: '通义千问 Turbo，极速响应',
    contextWindow: 128_000,
    maxTokens: 32_768,
    input: ['text'],
    capabilities: ['fast', 'costEffective', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-completions',
    pricing: {
      inputPerMillion: 0.3,
      outputPerMillion: 0.6,
    },
  },
  {
    id: 'qwen-vl-max',
    name: 'Qwen VL Max',
    provider: 'qwen',
    description: '通义千问 VL Max，多模态理解',
    contextWindow: 128_000,
    maxTokens: 8_192,
    input: ['text', 'image'],
    capabilities: ['multimodal', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-completions',
    pricing: {
      inputPerMillion: 2,
      outputPerMillion: 6,
    },
  },
  {
    id: 'qwen-long',
    name: 'Qwen Long',
    provider: 'qwen',
    description: '通义千问 Long，超长文本',
    contextWindow: 10_000_000,
    maxTokens: 8_192,
    input: ['text'],
    capabilities: ['longContext', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-completions',
    pricing: {
      inputPerMillion: 0.5,
      outputPerMillion: 2,
    },
  },
];

const QWEN_PROVIDER: ProviderInfo = {
  id: 'qwen',
  name: '阿里通义',
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  authType: 'bearer',
  categories: ['cloud', 'llm', 'chinese', 'multimodal'],
  docsPath: '/providers/qwen',
  models: QWEN_MODELS,
  description: '阿里通义千问系列模型',
  website: 'https://dashscope.aliyun.com',
  auth: [
    {
      methodId: 'api-key',
      label: '通义 API Key',
      hint: '从阿里云 DashScope 获取',
      envVar: 'DASHSCOPE_API_KEY',
      flagName: '--dashscope-api-key',
      optionKey: 'dashscopeApiKey',
      promptMessage: '请输入通义 API Key',
      defaultModel: 'qwen-plus',
    },
  ],
};

// ============================================================
// 腾讯混元
// ============================================================

const TENCENT_MODELS: ModelInfo[] = [
  {
    id: 'hunyuan-pro',
    name: '混元 Pro',
    provider: 'tencent',
    description: '腾讯混元 Pro，推理与代码',
    contextWindow: 128_000,
    maxTokens: 8_192,
    input: ['text'],
    capabilities: ['reasoning', 'code', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-completions',
    pricing: {
      inputPerMillion: 0.1,
      outputPerMillion: 0.1,
    },
  },
  {
    id: 'hunyuan-standard',
    name: '混元 Standard',
    provider: 'tencent',
    description: '腾讯混元 Standard，均衡能力',
    contextWindow: 128_000,
    maxTokens: 8_192,
    input: ['text'],
    capabilities: ['general', 'costEffective'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-completions',
    pricing: {
      inputPerMillion: 0.01,
      outputPerMillion: 0.01,
    },
  },
  {
    id: 'hunyuan-lite',
    name: '混元 Lite',
    provider: 'tencent',
    description: '腾讯混元 Lite，极速轻量',
    contextWindow: 32_000,
    maxTokens: 4_096,
    input: ['text'],
    capabilities: ['fast', 'costEffective', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-completions',
    pricing: { isFree: true },
  },
  {
    id: 'hunyuan-vision',
    name: '混元 Vision',
    provider: 'tencent',
    description: '腾讯混元 Vision，多模态理解',
    contextWindow: 8_000,
    maxTokens: 4_096,
    input: ['text', 'image'],
    capabilities: ['multimodal', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-completions',
    pricing: {
      inputPerMillion: 0.1,
      outputPerMillion: 0.1,
    },
  },
];

const TENCENT_PROVIDER: ProviderInfo = {
  id: 'tencent',
  name: '腾讯混元',
  baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
  authType: 'bearer',
  categories: ['cloud', 'llm', 'chinese'],
  docsPath: '/providers/tencent',
  models: TENCENT_MODELS,
  description: '腾讯混元系列模型',
  website: 'https://cloud.tencent.com/product/hunyuan',
  auth: [
    {
      methodId: 'api-key',
      label: '混元 API Key',
      hint: '从腾讯云获取',
      envVar: 'TENCENT_API_KEY',
      flagName: '--tencent-api-key',
      optionKey: 'tencentApiKey',
      promptMessage: '请输入混元 API Key',
      defaultModel: 'hunyuan-lite',
    },
  ],
};

// ============================================================
// 字节豆包 (Volcengine)
// ============================================================

const VOLCENGINE_MODELS: ModelInfo[] = [
  {
    id: 'doubao-pro-32k',
    name: '豆包 Pro 32K',
    provider: 'volcengine',
    description: '字节豆包 Pro，推理与代码',
    contextWindow: 32_000,
    maxTokens: 4_096,
    input: ['text'],
    capabilities: ['reasoning', 'code', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-completions',
    pricing: {
      inputPerMillion: 0.8,
      outputPerMillion: 2,
    },
  },
  {
    id: 'doubao-pro-128k',
    name: '豆包 Pro 128K',
    provider: 'volcengine',
    description: '字节豆包 Pro 128K，长文本',
    contextWindow: 128_000,
    maxTokens: 4_096,
    input: ['text'],
    capabilities: ['reasoning', 'longContext', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-completions',
    pricing: {
      inputPerMillion: 5,
      outputPerMillion: 5,
    },
  },
  {
    id: 'doubao-lite-32k',
    name: '豆包 Lite 32K',
    provider: 'volcengine',
    description: '字节豆包 Lite，极速轻量',
    contextWindow: 32_000,
    maxTokens: 4_096,
    input: ['text'],
    capabilities: ['fast', 'costEffective', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-completions',
    pricing: {
      inputPerMillion: 0.3,
      outputPerMillion: 0.6,
    },
  },
];

const VOLCENGINE_PROVIDER: ProviderInfo = {
  id: 'volcengine',
  name: '字节豆包',
  baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
  authType: 'bearer',
  categories: ['cloud', 'llm', 'chinese'],
  docsPath: '/providers/volcengine',
  models: VOLCENGINE_MODELS,
  description: '字节豆包系列模型',
  website: 'https://www.volcengine.com/product/doubao',
  auth: [
    {
      methodId: 'api-key',
      label: '豆包 API Key',
      hint: '从火山引擎获取',
      envVar: 'VOLCENGINE_API_KEY',
      flagName: '--volcengine-api-key',
      optionKey: 'volcengineApiKey',
      promptMessage: '请输入豆包 API Key',
      defaultModel: 'doubao-lite-32k',
    },
  ],
};

// ============================================================
// xAI (Grok)
// ============================================================

const XAI_MODELS: ModelInfo[] = [
  {
    id: 'grok-3',
    name: 'Grok 3',
    provider: 'xai',
    description: 'xAI Grok 3，推理与代码',
    contextWindow: 131_072,
    maxTokens: 32_768,
    input: ['text', 'image'],
    capabilities: ['reasoning', 'code', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-completions',
    isRecommended: true,
    pricing: {
      inputPerMillion: 3,
      outputPerMillion: 15,
    },
  },
  {
    id: 'grok-3-mini',
    name: 'Grok 3 Mini',
    provider: 'xai',
    description: 'xAI Grok 3 Mini，轻量推理',
    contextWindow: 131_072,
    maxTokens: 32_768,
    input: ['text'],
    capabilities: ['fast', 'costEffective', 'reasoning', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-completions',
    pricing: {
      inputPerMillion: 0.3,
      outputPerMillion: 1.5,
    },
  },
  {
    id: 'grok-2-vision',
    name: 'Grok 2 Vision',
    provider: 'xai',
    description: 'xAI Grok 2 Vision，多模态',
    contextWindow: 131_072,
    maxTokens: 32_768,
    input: ['text', 'image'],
    capabilities: ['multimodal', 'general'],
    supportsTools: true,
    supportsStreaming: true,
    apiType: 'openai-completions',
    pricing: {
      inputPerMillion: 2,
      outputPerMillion: 10,
    },
  },
];

const XAI_PROVIDER: ProviderInfo = {
  id: 'xai',
  name: 'xAI',
  baseUrl: 'https://api.x.ai/v1',
  authType: 'bearer',
  categories: ['cloud', 'llm', 'international', 'reasoning'],
  docsPath: '/providers/xai',
  models: XAI_MODELS,
  description: 'xAI Grok 系列模型',
  website: 'https://x.ai',
  auth: [
    {
      methodId: 'api-key',
      label: 'xAI API Key',
      hint: '从 xAI Console 获取',
      envVar: 'XAI_API_KEY',
      flagName: '--xai-api-key',
      optionKey: 'xaiApiKey',
      promptMessage: '请输入 xAI API Key',
      defaultModel: 'grok-3-mini',
    },
  ],
};

// ============================================================
// 导出中国提供商集合
// ============================================================

export const CHINESE_PROVIDERS: ProviderInfo[] = [
  BIGMODEL_PROVIDER,
  QWEN_PROVIDER,
  TENCENT_PROVIDER,
  VOLCENGINE_PROVIDER,
  XAI_PROVIDER, // xAI 虽然是国际公司，但在中国也有用户
];
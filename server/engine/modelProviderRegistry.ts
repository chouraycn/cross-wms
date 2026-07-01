/**
 * ModelProviderRegistry — 模型提供商注册表
 *
 * 参考 OpenClaw provider-index 模式，集中管理所有模型提供商的元数据和模型信息。
 * 支持动态注册、按 ID 查询、按分类筛选等操作。
 *
 * 包含提供商：
 * - Anthropic（Claude 系列，支持 thinking）
 * - Google（Gemini 系列，支持 thinking）
 * - DeepSeek（DeepSeek V3/R1，支持 thinking）
 * - Mistral（Mistral/Codestral）
 * - Groq（快速推理）
 * - Moonshot（Kimi）
 * - MiniMax
 * - NVIDIA NIM
 * - OpenAI
 * - 以及中国模型提供商（智谱、阿里通义、腾讯混元等）
 */

import type { ProviderInfo, ModelInfo, ModelCatalogIndex, ThinkingProfile } from './modelCatalog.js';
import { ANTHROPIC_PROVIDER } from './modelProviderAnthropic.js';
import { GOOGLE_PROVIDER } from './modelProviderGoogle.js';
import { DEEPSEEK_PROVIDER } from './modelProviderDeepSeek.js';
import { MISTRAL_PROVIDER } from './modelProviderMistral.js';
import { GROQ_PROVIDER } from './modelProviderGroq.js';
import { MOONSHOT_PROVIDER } from './modelProviderMoonshot.js';
import { MINIMAX_PROVIDER } from './modelProviderMinimax.js';
import { NVIDIA_PROVIDER } from './modelProviderNvidia.js';
import { OPENAI_PROVIDER } from './modelProviderOpenai.js';
import { CHINESE_PROVIDERS } from './modelProviderChinese.js';
import { OLLAMA_PROVIDER } from './modelProviderOllama.js';

// ============================================================
// 全局注册表
// ============================================================

/** 内置提供商列表 */
const BUILTIN_PROVIDERS: ProviderInfo[] = [
  // 国际提供商
  ANTHROPIC_PROVIDER,
  GOOGLE_PROVIDER,
  DEEPSEEK_PROVIDER,
  MISTRAL_PROVIDER,
  GROQ_PROVIDER,
  OPENAI_PROVIDER,
  NVIDIA_PROVIDER,
  // 中国提供商
  ...CHINESE_PROVIDERS,
  // 其他
  MOONSHOT_PROVIDER,
  MINIMAX_PROVIDER,
  // 本地
  OLLAMA_PROVIDER,
];

/** 提供商注册表（内存缓存） */
let providerRegistry: Map<string, ProviderInfo> | null = null;

/** 模型目录索引（内存缓存） */
let catalogCache: ModelCatalogIndex | null = null;

// ============================================================
// 注册表操作
// ============================================================

/**
 * 初始化注册表（加载内置提供商）
 */
function initRegistry(): void {
  if (providerRegistry) return;

  providerRegistry = new Map<string, ProviderInfo>();
  for (const provider of BUILTIN_PROVIDERS) {
    providerRegistry.set(provider.id, provider);
  }
}

/**
 * 获取所有已注册的提供商
 */
export function getAllProviders(): ProviderInfo[] {
  initRegistry();
  return Array.from(providerRegistry!.values());
}

/**
 * 根据 ID 获取提供商信息
 */
export function getProviderById(id: string): ProviderInfo | undefined {
  initRegistry();
  return providerRegistry!.get(id);
}

/**
 * 注册新的提供商
 */
export function registerProvider(provider: ProviderInfo): void {
  initRegistry();
  providerRegistry!.set(provider.id, provider);
  // 清除缓存
  catalogCache = null;
}

/**
 * 注销提供商
 */
export function unregisterProvider(id: string): boolean {
  initRegistry();
  const result = providerRegistry!.delete(id);
  if (result) {
    catalogCache = null;
  }
  return result;
}

/**
 * 获取模型目录索引
 */
export function getCatalogIndex(): ModelCatalogIndex {
  if (catalogCache) return catalogCache;

  initRegistry();
  const providers: Record<string, ProviderInfo> = {};
  for (const [id, provider] of providerRegistry!) {
    providers[id] = provider;
  }

  catalogCache = {
    version: 1,
    providers,
    updatedAt: new Date().toISOString(),
  };

  return catalogCache;
}

// ============================================================
// 提供商分类筛选
// ============================================================

/**
 * 获取支持思考模式的提供商
 */
export function getThinkingProviders(): ProviderInfo[] {
  return getAllProviders().filter(p =>
    p.models.some(m => m.thinkingProfile || m.reasoning)
  );
}

/**
 * 获取中国模型提供商
 */
export function getChineseProviders(): ProviderInfo[] {
  return getAllProviders().filter(p =>
    p.categories?.includes('chinese')
  );
}

/**
 * 获取国际模型提供商
 */
export function getInternationalProviders(): ProviderInfo[] {
  return getAllProviders().filter(p =>
    p.categories?.includes('international')
  );
}

/**
 * 获取本地部署提供商
 */
export function getLocalProviders(): ProviderInfo[] {
  return getAllProviders().filter(p => p.isLocal);
}

/**
 * 获取云服务提供商
 */
export function getCloudProviders(): ProviderInfo[] {
  return getAllProviders().filter(p =>
    p.categories?.includes('cloud') && !p.isLocal
  );
}

/**
 * 获取支持多模态的提供商
 */
export function getMultimodalProviders(): ProviderInfo[] {
  return getAllProviders().filter(p =>
    p.models.some(m => m.input?.includes('image') || m.capabilities?.includes('multimodal'))
  );
}

// ============================================================
// 模型查找
// ============================================================

/**
 * 获取所有模型列表
 */
export function getAllModels(): ModelInfo[] {
  const models: ModelInfo[] = [];
  for (const provider of getAllProviders()) {
    models.push(...provider.models);
  }
  return models;
}

/**
 * 根据 ID 获取模型信息
 */
export function getModelById(modelId: string): ModelInfo | undefined {
  for (const provider of getAllProviders()) {
    const model = provider.models.find(m =>
      m.id === modelId || m.aliases?.includes(modelId)
    );
    if (model) return model;
  }
  return undefined;
}

/**
 * 获取指定提供商的所有模型
 */
export function getModelsByProvider(providerId: string): ModelInfo[] {
  const provider = getProviderById(providerId);
  return provider?.models || [];
}

/**
 * 获取推荐模型列表
 */
export function getRecommendedModels(): ModelInfo[] {
  const recommended: ModelInfo[] = [];
  for (const provider of getAllProviders()) {
    for (const model of provider.models) {
      if (model.isRecommended) {
        recommended.push(model);
      }
    }
  }
  return recommended;
}

/**
 * 根据能力筛选模型
 */
export function getModelsByCapability(capabilities: string[]): ModelInfo[] {
  return getAllModels().filter(m =>
    capabilities.every(cap => m.capabilities?.includes(cap as any))
  );
}

/**
 * 获取支持思考模式的模型
 */
export function getThinkingModels(): ModelInfo[] {
  return getAllModels().filter(m =>
    m.thinkingProfile || m.reasoning
  );
}

// ============================================================
// 思考模式配置
// ============================================================

/**
 * 获取模型的思考模式配置
 */
export function getThinkingProfile(modelId: string): ThinkingProfile | undefined {
  const model = getModelById(modelId);
  return model?.thinkingProfile;
}

/**
 * 获取思考模式支持的级别列表
 */
export function getThinkingLevels(modelId: string): string[] {
  const profile = getThinkingProfile(modelId);
  return profile?.levels.map(l => l.id) || [];
}

/**
 * 获取思考模式默认级别
 */
export function getThinkingDefaultLevel(modelId: string): string | undefined {
  const profile = getThinkingProfile(modelId);
  return profile?.defaultLevel;
}

// ============================================================
// 提供商快速查询
// ============================================================

/** 提供商 ID 到名称的映射 */
const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  google: 'Google',
  deepseek: 'DeepSeek',
  mistral: 'Mistral',
  groq: 'Groq',
  openai: 'OpenAI',
  nvidia: 'NVIDIA',
  moonshot: 'Moonshot (Kimi)',
  minimax: 'MiniMax',
  ollama: 'Ollama',
  bigmodel: '智谱 AI',
  qwen: '阿里通义',
  tencent: '腾讯混元',
  volcengine: '字节豆包',
  xai: 'xAI',
  openrouter: 'OpenRouter',
};

/**
 * 获取提供商显示名称
 */
export function getProviderLabel(providerId: string): string {
  return PROVIDER_LABELS[providerId] || getProviderById(providerId)?.name || providerId;
}

/**
 * 获取提供商 Base URL
 */
export function getProviderBaseUrl(providerId: string): string | undefined {
  return getProviderById(providerId)?.baseUrl;
}

/**
 * 获取提供商认证类型
 */
export function getProviderAuthType(providerId: string): string | undefined {
  return getProviderById(providerId)?.authType;
}

/**
 * 检查提供商是否需要 API Key
 */
export function providerNeedsApiKey(providerId: string): boolean {
  const provider = getProviderById(providerId);
  return !provider?.isLocal && provider?.authType !== 'none';
}

// ============================================================
// 导出类型和常量
// ============================================================

export type { ProviderInfo, ModelInfo, ModelCatalogIndex, ThinkingProfile };

/** 内置提供商 ID 列表 */
export const BUILTIN_PROVIDER_IDS = BUILTIN_PROVIDERS.map(p => p.id);
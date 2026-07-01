/**
 * ModelCatalog — 模型目录核心类型定义
 *
 * 参考 OpenClaw provider-index 模式，提供标准化的模型提供商和模型元数据。
 * 用于模型发现、可用性检测、配置自动填充等场景。
 *
 * 核心概念：
 * - ProviderInfo: 提供商元信息（ID、名称、认证方式、模型列表）
 * - ModelInfo: 模型详细信息（ID、名称、上下文窗口、能力、定价）
 * - discoverModels: 从提供商 API 自动发现可用模型
 */

import type { ModelProvider, ModelCapability } from '../../shared/types/models.js';

// ============================================================
// 核心类型定义
// ============================================================

/** 认证方式类型 */
export type AuthType = 'api-key' | 'x-api-key' | 'bearer' | 'oauth' | 'none';

/** 提供商分类 */
export type ProviderCategory = 'cloud' | 'local' | 'llm' | 'multimodal' | 'reasoning' | 'chinese' | 'international' | 'fast' | 'longContext';

/** 思考/推理模式级别 */
export interface ThinkingLevel {
  id: string;
  label?: string;
  description?: string;
}

/** 思考模式配置 */
export interface ThinkingProfile {
  levels: ThinkingLevel[];
  defaultLevel: string;
}

/** 模型输入类型 */
export type ModelInputType = 'text' | 'image' | 'audio' | 'video' | 'pdf';

/** 模型定价信息 */
export interface ModelPricing {
  /** 输入价格（每百万 token，美元） */
  inputPerMillion?: number;
  /** 输出价格（每百万 token，美元） */
  outputPerMillion?: number;
  /** 是否免费 */
  isFree?: boolean;
  /** 定价备注 */
  note?: string;
}

/** 模型详细信息 */
export interface ModelInfo {
  /** 模型唯一标识 */
  id: string;
  /** 模型显示名称 */
  name: string;
  /** 所属提供商 ID */
  provider: ModelProvider;
  /** 模型描述 */
  description?: string;
  /** 上下文窗口大小（token 数） */
  contextWindow: number;
  /** 最大输出 token 数 */
  maxTokens?: number;
  /** 支持的输入类型 */
  input?: ModelInputType[];
  /** 模型能力标签 */
  capabilities?: ModelCapability[];
  /** 是否支持推理/思考模式 */
  reasoning?: boolean;
  /** 思考模式配置（如有） */
  thinkingProfile?: ThinkingProfile;
  /** 定价信息 */
  pricing?: ModelPricing;
  /** 是否为推荐模型 */
  isRecommended?: boolean;
  /** API 兼容类型（openai-completions / anthropic-messages 等） */
  apiType?: 'openai-completions' | 'anthropic-messages' | 'google-gemini' | 'mistral';
  /** 是否支持工具调用 */
  supportsTools?: boolean;
  /** 是否支持流式输出 */
  supportsStreaming?: boolean;
  /** 是否支持函数调用 */
  supportsFunctionCall?: boolean;
  /** 模型别名（用于 API 兼容映射） */
  aliases?: string[];
}

/** 提供商认证配置 */
export interface ProviderAuthConfig {
  /** 认证方式 ID */
  methodId: string;
  /** 认证方式标签 */
  label: string;
  /** 提示文本 */
  hint?: string;
  /** 环境变量名 */
  envVar?: string;
  /** CLI 参数名 */
  flagName?: string;
  /** 配置文件中的 key */
  optionKey?: string;
  /** 提示输入消息 */
  promptMessage?: string;
  /** 默认模型 ID */
  defaultModel?: string;
}

/** 提供商信息 */
export interface ProviderInfo {
  /** 提供商唯一标识 */
  id: ModelProvider;
  /** 提供商显示名称 */
  name: string;
  /** API Base URL */
  baseUrl: string;
  /** 认证方式 */
  authType: AuthType;
  /** 认证配置列表 */
  auth?: ProviderAuthConfig[];
  /** 提供商分类 */
  categories?: ProviderCategory[];
  /** 文档路径 */
  docsPath?: string;
  /** 模型列表 */
  models: ModelInfo[];
  /** 是否为本地部署（不需要 API Key） */
  isLocal?: boolean;
  /** 是否支持自定义 Base URL */
  allowCustomBaseUrl?: boolean;
  /** 提供商描述 */
  description?: string;
  /** 提供商图标 */
  icon?: string;
  /** 官网链接 */
  website?: string;
}

/** 模型目录索引 */
export interface ModelCatalogIndex {
  version: number;
  providers: Record<string, ProviderInfo>;
  updatedAt?: string;
}

// ============================================================
// 模型发现功能
// ============================================================

/** 模型发现结果 */
export interface ModelDiscoveryResult {
  provider: ModelProvider;
  models: ModelInfo[];
  discoveredAt: string;
  error?: string;
}

/** 模型发现选项 */
export interface ModelDiscoveryOptions {
  /** API Key（用于认证） */
  apiKey?: string;
  /** 自定义 Base URL */
  baseUrl?: string;
  /** 超时时间（毫秒） */
  timeoutMs?: number;
  /** 是否包含未知模型 */
  includeUnknown?: boolean;
}

/**
 * 从提供商 API 发现可用模型
 *
 * @param provider 提供商信息
 * @param options 发现选项
 * @returns 发现的模型列表
 */
export async function discoverModels(
  provider: ProviderInfo,
  options: ModelDiscoveryOptions = {},
): Promise<ModelDiscoveryResult> {
  const { apiKey, baseUrl, timeoutMs = 8000 } = options;
  const effectiveBaseUrl = baseUrl || provider.baseUrl;

  // 本地提供商不需要认证
  if (provider.isLocal) {
    return discoverLocalModels(provider, effectiveBaseUrl, timeoutMs);
  }

  // 远程提供商需要 API Key
  if (!apiKey) {
    return {
      provider: provider.id,
      models: [],
      discoveredAt: new Date().toISOString(),
      error: 'Missing API key',
    };
  }

  return discoverRemoteModels(provider, effectiveBaseUrl, apiKey, timeoutMs);
}

/**
 * 发现本地模型（如 Ollama）
 */
async function discoverLocalModels(
  provider: ProviderInfo,
  baseUrl: string,
  timeoutMs: number,
): Promise<ModelDiscoveryResult> {
  try {
    // Ollama 使用 /api/tags 端点
    const isOllama = provider.id === 'ollama';
    const url = isOllama
      ? `${baseUrl.replace(/\/v1$/, '')}/api/tags`
      : `${baseUrl.replace(/\/$/, '')}/models`;

    const resp = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!resp.ok) {
      return {
        provider: provider.id,
        models: [],
        discoveredAt: new Date().toISOString(),
        error: `HTTP ${resp.status}`,
      };
    }

    const data = await resp.json();
    let modelIds: string[] = [];

    if (isOllama && Array.isArray((data as any).models)) {
      modelIds = (data as any).models.map((m: any) => m.name || m.model || '');
    } else if (Array.isArray((data as any).data)) {
      modelIds = (data as any).data.map((m: any) => m.id || '');
    }

    // 将发现的模型 ID 映射到 ModelInfo
    const models: ModelInfo[] = [];
    for (const modelId of modelIds) {
      const knownModel = provider.models.find(m => m.id === modelId || m.aliases?.includes(modelId));
      if (knownModel) {
        models.push(knownModel);
      } else {
        // 未知模型：创建基础信息
        models.push({
          id: modelId,
          name: modelId.split(':')[0] || modelId,
          provider: provider.id,
          contextWindow: 128_000,
          maxTokens: 4_096,
          capabilities: ['general'],
        });
      }
    }

    return {
      provider: provider.id,
      models,
      discoveredAt: new Date().toISOString(),
    };
  } catch (e) {
    return {
      provider: provider.id,
      models: [],
      discoveredAt: new Date().toISOString(),
      error: (e as Error).message,
    };
  }
}

/**
 * 发现远程模型（OpenAI 兼容 API）
 */
async function discoverRemoteModels(
  provider: ProviderInfo,
  baseUrl: string,
  apiKey: string,
  timeoutMs: number,
): Promise<ModelDiscoveryResult> {
  try {
    const url = `${baseUrl.replace(/\/$/, '')}/models`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // 根据认证类型设置 header
    if (provider.authType === 'x-api-key') {
      headers['x-api-key'] = apiKey;
    } else if (provider.authType === 'bearer' || provider.authType === 'api-key') {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const resp = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!resp.ok) {
      return {
        provider: provider.id,
        models: [],
        discoveredAt: new Date().toISOString(),
        error: `HTTP ${resp.status}`,
      };
    }

    const data = await resp.json();
    let modelIds: string[] = [];

    if (Array.isArray((data as any).data)) {
      modelIds = (data as any).data.map((m: any) => m.id || '');
    }

    // 将发现的模型 ID 映射到 ModelInfo
    const models: ModelInfo[] = [];
    for (const modelId of modelIds) {
      const knownModel = provider.models.find(m => m.id === modelId || m.aliases?.includes(modelId));
      if (knownModel) {
        models.push(knownModel);
      }
      // 远程提供商通常不添加未知模型（避免杂乱）
    }

    return {
      provider: provider.id,
      models,
      discoveredAt: new Date().toISOString(),
    };
  } catch (e) {
    return {
      provider: provider.id,
      models: [],
      discoveredAt: new Date().toISOString(),
      error: (e as Error).message,
    };
  }
}

// ============================================================
// 模型可用性检测
// ============================================================

/** 可用性检测结果 */
export interface AvailabilityCheckResult {
  provider: ModelProvider;
  modelId: string;
  isAvailable: boolean;
  checkedAt: string;
  error?: string;
  latencyMs?: number;
}

/**
 * 检测模型可用性
 *
 * 发送一个最小化请求验证模型是否可正常调用。
 *
 * @param provider 提供商信息
 * @param modelId 模型 ID
 * @param apiKey API Key
 * @param options 检测选项
 */
export async function checkModelAvailability(
  provider: ProviderInfo,
  modelId: string,
  apiKey: string,
  options: { timeoutMs?: number; baseUrl?: string } = {},
): Promise<AvailabilityCheckResult> {
  const { timeoutMs = 5000, baseUrl } = options;
  const effectiveBaseUrl = baseUrl || provider.baseUrl;
  const startTime = Date.now();

  try {
    // 使用最小化请求验证模型可用性
    const url = `${effectiveBaseUrl.replace(/\/$/, '')}/chat/completions`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (provider.authType === 'x-api-key') {
      headers['x-api-key'] = apiKey;
    } else {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    // 发送一个最小的测试请求
    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const latencyMs = Date.now() - startTime;

    if (resp.ok) {
      return {
        provider: provider.id,
        modelId,
        isAvailable: true,
        checkedAt: new Date().toISOString(),
        latencyMs,
      };
    }

    // 检查是否为模型不可用错误
    const errorData = await resp.json().catch(() => ({}));
    const errorMessage = (errorData as any).error?.message || `HTTP ${resp.status}`;

    return {
      provider: provider.id,
      modelId,
      isAvailable: false,
      checkedAt: new Date().toISOString(),
      error: errorMessage,
      latencyMs,
    };
  } catch (e) {
    return {
      provider: provider.id,
      modelId,
      isAvailable: false,
      checkedAt: new Date().toISOString(),
      error: (e as Error).message,
      latencyMs: Date.now() - startTime,
    };
  }
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 根据 ID 获取模型信息
 */
export function getModelInfo(catalog: ModelCatalogIndex, modelId: string): ModelInfo | undefined {
  for (const provider of Object.values(catalog.providers)) {
    const model = provider.models.find(m => m.id === modelId || m.aliases?.includes(modelId));
    if (model) return model;
  }
  return undefined;
}

/**
 * 根据提供商 ID 获取提供商信息
 */
export function getProviderInfo(catalog: ModelCatalogIndex, providerId: ModelProvider): ProviderInfo | undefined {
  return catalog.providers[providerId];
}

/**
 * 获取所有推荐模型
 */
export function getRecommendedModels(catalog: ModelCatalogIndex): ModelInfo[] {
  const recommended: ModelInfo[] = [];
  for (const provider of Object.values(catalog.providers)) {
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
export function filterModelsByCapability(
  catalog: ModelCatalogIndex,
  capabilities: ModelCapability[],
): ModelInfo[] {
  const filtered: ModelInfo[] = [];
  for (const provider of Object.values(catalog.providers)) {
    for (const model of provider.models) {
      if (capabilities.every(cap => model.capabilities?.includes(cap))) {
        filtered.push(model);
      }
    }
  }
  return filtered;
}

/**
 * 将 ModelInfo 转换为 ModelConfig（用于模型管理）
 */
export function modelInfoToConfig(model: ModelInfo, provider: ProviderInfo): import('../../shared/types/models.js').ModelConfig {
  return {
    id: model.id,
    name: model.name,
    provider: model.provider,
    apiEndpoint: provider.baseUrl,
    enabled: false,
    isDefault: false,
    description: model.description,
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
    capabilities: model.capabilities,
  };
}
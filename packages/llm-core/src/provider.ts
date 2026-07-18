import EventEmitter from 'eventemitter3';
import type { LlmUsage } from './streaming';

export type ProviderType = 'llm' | 'embedding' | 'tts' | 'stt' | 'image' | 'video';

/**
 * Provider 配置信息
 */
export interface ProviderConfig {
  /** Provider ID */
  id: string;
  /** Provider 显示名称 */
  name: string;
  /** API 基础 URL */
  baseUrl: string;
  /** 环境变量中的 API Key 名称 */
  apiKeyEnv: string;
  /** 支持的能力 */
  capabilities: string[];
  /** Provider 特殊参数 */
  extraParams?: Record<string, unknown>;
}

/**
 * 国内模型 Provider 配置
 */
export const CHINESE_PROVIDERS: Record<string, ProviderConfig> = {
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    capabilities: ['chat', 'streaming', 'reasoning', 'tool_calls', 'json_mode'],
    extraParams: { supports_reasoning: true },
  },
  alibaba: {
    id: 'alibaba',
    name: '阿里云通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKeyEnv: 'DASHSCOPE_API_KEY',
    capabilities: ['chat', 'streaming', 'vision', 'tool_calls', 'json_mode', 'search_grounding'],
    extraParams: { supports_search: true },
  },
  kimi: {
    id: 'kimi',
    name: 'Moonshot Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    apiKeyEnv: 'MOONSHOT_API_KEY',
    capabilities: ['chat', 'streaming', 'file_upload', 'long_context'],
  },
  stepfun: {
    id: 'stepfun',
    name: '阶跃星辰',
    baseUrl: 'https://api.stepfun.com/v1',
    apiKeyEnv: 'STEPFUN_API_KEY',
    capabilities: ['chat', 'streaming', 'vision', 'long_context'],
  },
  doubao: {
    id: 'doubao',
    name: '字节豆包',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    apiKeyEnv: 'DOUBAO_API_KEY',
    capabilities: ['chat', 'streaming', 'tool_calls'],
    extraParams: { requires_endpoint_id: true },
  },
  yi: {
    id: 'yi',
    name: '零一万物',
    baseUrl: 'https://api.lingyiwanwu.com/v1',
    apiKeyEnv: 'YI_API_KEY',
    capabilities: ['chat', 'streaming', 'long_context'],
  },
  baichuan: {
    id: 'baichuan',
    name: '百川智能',
    baseUrl: 'https://api.baichuan-ai.com/v1',
    apiKeyEnv: 'BAICHUAN_API_KEY',
    capabilities: ['chat', 'streaming', 'tool_calls'],
  },
  minimax: {
    id: 'minimax',
    name: 'MiniMax',
    baseUrl: 'https://api.minimax.chat/v1',
    apiKeyEnv: 'MINIMAX_API_KEY',
    capabilities: ['chat', 'streaming', 'tool_calls', 'vision'],
    extraParams: { group_id_required: true },
  },
};

/**
 * 从模型 ID 前缀推断 Provider
 */
export function detectProviderByModelId(modelId: string): ProviderConfig | null {
  const prefixMap: Record<string, string> = {
    'deepseek-': 'deepseek',
    'qwen-': 'alibaba',
    'qwen2-': 'alibaba',
    'qwen2.5-': 'alibaba',
    'kimi-': 'kimi',
    'moonshot-': 'kimi',
    'step-': 'stepfun',
    'doubao-': 'doubao',
    'yi-': 'yi',
    'baichuan': 'baichuan',
    'abab': 'minimax',
  };

  const lowerModelId = modelId.toLowerCase();

  for (const [prefix, providerId] of Object.entries(prefixMap)) {
    if (lowerModelId.startsWith(prefix)) {
      return CHINESE_PROVIDERS[providerId] || null;
    }
  }

  return null;
}

/**
 * 从 API Endpoint 域名推断 Provider
 */
export function detectProviderByEndpoint(endpoint: string): ProviderConfig | null {
  try {
    const url = new URL(endpoint);
    const hostname = url.hostname.toLowerCase();

    const domainMap: Record<string, string> = {
      'deepseek.com': 'deepseek',
      'dashscope.aliyuncs.com': 'alibaba',
      'moonshot.cn': 'kimi',
      'stepfun.com': 'stepfun',
      'ark.cn-beijing.volces.com': 'doubao',
      'lingyiwanwu.com': 'yi',
      'baichuan-ai.com': 'baichuan',
      'minimax.chat': 'minimax',
    };

    for (const [domain, providerId] of Object.entries(domainMap)) {
      if (hostname.includes(domain)) {
        return CHINESE_PROVIDERS[providerId] || null;
      }
    }
  } catch {
    // URL 解析失败，返回 null
  }

  return null;
}

/**
 * 综合检测 Provider
 */
export function detectProvider(modelId: string, endpoint?: string): ProviderConfig | null {
  // 优先从 endpoint 检测
  if (endpoint) {
    const provider = detectProviderByEndpoint(endpoint);
    if (provider) return provider;
  }

  // 从 modelId 检测
  return detectProviderByModelId(modelId);
}

export interface ProviderAuthContext {
  apiKey?: string;
  baseUrl?: string;
  organization?: string;
  extraHeaders?: Record<string, string>;
  extraParams?: Record<string, unknown>;
}

export interface ProviderAuthResult {
  success: boolean;
  token?: string;
  expiresAt?: number;
  error?: string;
}

export interface ProviderModel {
  id: string;
  name: string;
  kind: ProviderType;
  capabilities: string[];
  contextWindow?: number;
}

export interface LlmProvider {
  type: 'llm';
  id: string;
  name: string;
  models: ProviderModel[];

  complete(
    model: string,
    messages: Array<{ role: string; content: string }>,
    options?: ProviderAuthContext & Record<string, unknown>,
  ): Promise<{ content: string; usage?: LlmUsage }>;

  stream(
    model: string,
    messages: Array<{ role: string; content: string }>,
    options?: ProviderAuthContext & Record<string, unknown>,
  ): AsyncGenerator<{
    type: 'token' | 'start' | 'finish' | 'error';
    content?: string;
    usage?: LlmUsage;
    error?: string;
  }>;

  authenticate?(context: ProviderAuthContext): Promise<ProviderAuthResult>;
  validateAuth?(): Promise<boolean>;
  listModels?(): Promise<ProviderModel[]>;
}

export interface ProviderRegistryEvents {
  provider_registered: [provider: LlmProvider];
  provider_unregistered: [providerId: string];
  provider_error: [providerId: string, error: Error];
}

export class ProviderRegistry extends EventEmitter<ProviderRegistryEvents> {
  private providers: Map<string, LlmProvider> = new Map();

  registerProvider(provider: LlmProvider): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`Provider ${provider.id} already registered`);
    }
    this.providers.set(provider.id, provider);
    this.emit('provider_registered', provider);
  }

  unregisterProvider(providerId: string): boolean {
    const existed = this.providers.delete(providerId);
    if (existed) {
      this.emit('provider_unregistered', providerId);
    }
    return existed;
  }

  getProvider(providerId: string): LlmProvider | undefined {
    return this.providers.get(providerId);
  }

  listProviders(): LlmProvider[] {
    return Array.from(this.providers.values());
  }

  hasProvider(providerId: string): boolean {
    return this.providers.has(providerId);
  }

  findProviderForModel(modelId: string): LlmProvider | undefined {
    for (const provider of this.providers.values()) {
      if (provider.models.some((m) => m.id === modelId || m.name === modelId)) {
        return provider;
      }
    }
    return undefined;
  }

  listAllModels(): ProviderModel[] {
    const models: ProviderModel[] = [];
    for (const provider of this.providers.values()) {
      models.push(...provider.models);
    }
    return models;
  }

  clear(): void {
    this.providers.clear();
  }

  size(): number {
    return this.providers.size;
  }
}

export const providerRegistry = new ProviderRegistry();

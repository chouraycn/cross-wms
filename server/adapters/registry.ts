/**
 * AI API 适配器注册表
 *
 * 管理所有可用的 API 适配器，支持按 API 类型获取适配器实例。
 *
 * 采用惰性加载机制：内置适配器模块仅在首次调用 getAdapter 时通过动态 import() 加载，
 * 避免启动时全量导入所有适配器及其依赖。外部注册的同步工厂仍被支持。
 */

import type { IAiApiAdapter, ModelApiType, AdapterFactory } from './types.js';
import { logger } from '../logger.js';

/** 惰性加载器：动态 import 后返回适配器工厂 */
type LazyAdapterFactory = () => Promise<AdapterFactory>;

/** 注册项：同步工厂 或 惰性加载器 */
type AdapterFactoryLoader = AdapterFactory | LazyAdapterFactory;

/** 适配器注册表 — 存储 apiType → 加载器 */
const adapterRegistry = new Map<ModelApiType, AdapterFactoryLoader>();

/** 已加载的适配器工厂缓存（避免重复动态 import） */
const factoryCache = new Map<ModelApiType, AdapterFactory>();

/** 进行中的动态 import Promise（防止并发重复加载） */
const loadingPromises = new Map<ModelApiType, Promise<AdapterFactory>>();

/**
 * 注册适配器
 *
 * @param apiType - API 类型
 * @param loader - 同步工厂函数（旧用法）或返回工厂的惰性加载器（新用法）
 */
export function registerAdapter(
  apiType: ModelApiType,
  loader: AdapterFactoryLoader,
): void {
  adapterRegistry.set(apiType, loader);
  // 重新注册时清理缓存
  factoryCache.delete(apiType);
  loadingPromises.delete(apiType);
  logger.info(`[AdapterRegistry] 已注册适配器: ${apiType}`);
}

/**
 * 获取适配器实例（惰性加载）
 *
 * 内置适配器首次调用时会动态 import 对应模块并缓存工厂函数；
 * 外部注册的同步工厂每次调用直接返回新实例。
 */
export async function getAdapter(apiType: ModelApiType): Promise<IAiApiAdapter | null> {
  // 命中工厂缓存（惰性加载器）
  const cachedFactory = factoryCache.get(apiType);
  if (cachedFactory) {
    return cachedFactory();
  }

  const loader = adapterRegistry.get(apiType);
  if (!loader) {
    logger.error(`[AdapterRegistry] 未找到适配器: ${apiType}`);
    return null;
  }

  const result = loader();

  // 惰性加载器返回 Promise<AdapterFactory>
  if (result instanceof Promise) {
    // 复用进行中的加载，避免并发重复 import
    let loadingPromise = loadingPromises.get(apiType);
    if (!loadingPromise) {
      loadingPromise = result;
      loadingPromises.set(apiType, loadingPromise);
    }

    try {
      const factory = await loadingPromise;
      factoryCache.set(apiType, factory);
      return factory();
    } catch (err) {
      logger.error(`[AdapterRegistry] 加载适配器 ${apiType} 失败:`, err);
      return null;
    } finally {
      loadingPromises.delete(apiType);
    }
  }

  // 同步工厂直接返回适配器实例
  return result;
}

/**
 * 检查适配器是否已注册
 */
export function hasAdapter(apiType: string): boolean {
  return adapterRegistry.has(apiType as ModelApiType);
}

/**
 * 获取所有已注册的 API 类型
 */
export function getRegisteredApiTypes(): ModelApiType[] {
  return Array.from(adapterRegistry.keys());
}

/**
 * 初始化内置适配器
 *
 * 仅注册惰性加载器（函数引用），实际适配器模块在首次 getAdapter 调用时才导入。
 */
export function initBuiltinAdapters(): void {
  registerAdapter('openai-chat', async () => {
    const m = await import('./openAIChatAdapter.js');
    return m.openAIChatAdapterFactory;
  });
  registerAdapter('openai-responses', async () => {
    const m = await import('./openAIResponsesAdapter.js');
    return m.openAIResponsesAdapterFactory;
  });
  registerAdapter('openai-completions', async () => {
    const m = await import('./openAICompletionsAdapter.js');
    return m.openAICompletionsAdapterFactory;
  });
  registerAdapter('anthropic-messages', async () => {
    const m = await import('./anthropicAdapter.js');
    return m.anthropicAdapterFactory;
  });
  registerAdapter('google-generative-ai', async () => {
    const m = await import('./googleGenerativeAIAdapter.js');
    return m.googleGenerativeAIAdapterFactory;
  });
  registerAdapter('qwen-chat', async () => {
    const m = await import('./qwenAdapter.js');
    return m.qwenAdapterFactory;
  });
  registerAdapter('moonshot-chat', async () => {
    const m = await import('./moonshotAdapter.js');
    return m.moonshotAdapterFactory;
  });
  logger.info('[AdapterRegistry] 内置适配器惰性注册完成');
}

/**
 * 根据 provider 和配置自动推断 API 类型
 */
export function inferApiType(provider?: string, apiEndpoint?: string): ModelApiType {
  if (!provider && !apiEndpoint) {
    return 'openai-chat';
  }

  const providerLower = (provider || '').toLowerCase();
  const endpointLower = (apiEndpoint || '').toLowerCase();

  // Anthropic
  if (providerLower === 'anthropic' ||
      endpointLower.includes('anthropic.com') ||
      endpointLower.includes('/messages')) {
    return 'anthropic-messages';
  }

  // Google Generative AI
  if (providerLower === 'google' ||
      providerLower === 'gemini' ||
      endpointLower.includes('generativelanguage.googleapis.com') ||
      endpointLower.includes('googleapis.com')) {
    return 'google-generative-ai';
  }

  // Qwen (阿里云通义)
  if (providerLower === 'qwen' ||
      providerLower === 'aliyun' ||
      providerLower === 'dashscope' ||
      endpointLower.includes('dashscope.aliyuncs.com')) {
    return 'qwen-chat';
  }

  // Moonshot (月之暗面)
  if (providerLower === 'moonshot' ||
      providerLower === 'kimi' ||
      endpointLower.includes('api.moonshot.cn')) {
    return 'moonshot-chat';
  }

  // OpenAI Responses API
  if (endpointLower.includes('/responses')) {
    return 'openai-responses';
  }

  // OpenAI Completions（旧格式）
  if (endpointLower.includes('/completions') && !endpointLower.includes('/chat/completions')) {
    return 'openai-completions';
  }

  // 默认使用 OpenAI Chat Completions
  return 'openai-chat';
}

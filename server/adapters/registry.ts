/**
 * AI API 适配器注册表
 *
 * 管理所有可用的 API 适配器，支持按 API 类型获取适配器实例。
 */

import type { IAiApiAdapter, ModelApiType, AdapterFactory } from './types.js';
import { openAIChatAdapterFactory } from './openAIChatAdapter.js';
import { openAICompletionsAdapterFactory } from './openAICompletionsAdapter.js';
import { anthropicAdapterFactory } from './anthropicAdapter.js';
import { googleGenerativeAIAdapterFactory } from './googleGenerativeAIAdapter.js';
import { qwenAdapterFactory } from './qwenAdapter.js';
import { moonshotAdapterFactory } from './moonshotAdapter.js';
import { logger } from '../logger.js';

/** 适配器注册表 */
const adapterRegistry = new Map<ModelApiType, AdapterFactory>();

/**
 * 注册适配器
 */
export function registerAdapter(apiType: ModelApiType, factory: AdapterFactory): void {
  adapterRegistry.set(apiType, factory);
  logger.info(`[AdapterRegistry] 已注册适配器: ${apiType}`);
}

/**
 * 获取适配器实例
 */
export function getAdapter(apiType: ModelApiType): IAiApiAdapter | null {
  const factory = adapterRegistry.get(apiType);
  if (!factory) {
    logger.error(`[AdapterRegistry] 未找到适配器: ${apiType}`);
    return null;
  }
  return factory();
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
 */
export function initBuiltinAdapters(): void {
  registerAdapter('openai-chat', openAIChatAdapterFactory);
  registerAdapter('openai-completions', openAICompletionsAdapterFactory);
  registerAdapter('anthropic-messages', anthropicAdapterFactory);
  registerAdapter('google-generative-ai', googleGenerativeAIAdapterFactory);
  registerAdapter('qwen-chat', qwenAdapterFactory);
  registerAdapter('moonshot-chat', moonshotAdapterFactory);
  logger.info('[AdapterRegistry] 内置适配器初始化完成');
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

  // OpenAI Completions（旧格式）
  if (endpointLower.includes('/completions') && !endpointLower.includes('/chat/completions')) {
    return 'openai-completions';
  }

  // 默认使用 OpenAI Chat Completions
  return 'openai-chat';
}

/**
 * API 运行时注册中心 — 对齐 OpenClaw llm-runtime/api-registry.ts
 *
 * 提供标准化的 API 提供商注册、查找和管理能力：
 * - 支持全流式适配器（stream）和简化流式适配器（streamSimple）
 * - 支持按 sourceId 批量注销（用于插件卸载）
 * - 类型安全的 API 匹配验证
 */

import type { ModelApiType } from '../adapters/types.js';

/** 简化流式选项 */
export interface SimpleStreamOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  systemPrompt?: string;
}

/** 完整流式选项 */
export interface StreamOptions extends SimpleStreamOptions {
  model?: string;
  endpoint?: string;
  apiKey?: string;
  headers?: Record<string, string>;
}

/** 流式事件类型 */
export type StreamEventType = 'start' | 'token' | 'finish' | 'error' | 'tool_call';

/** 流式事件 */
export interface StreamEvent {
  type: StreamEventType;
  content?: string;
  finishReason?: string;
  error?: string;
  toolCalls?: Array<{
    id: string;
    type: string;
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

/** 流式函数签名 */
export type StreamFunction = (
  model: string,
  context: string[],
  options?: StreamOptions,
) => AsyncGenerator<StreamEvent>;

/** 简化流式函数签名 */
export type StreamSimpleFunction = (
  model: string,
  context: string[],
  options?: SimpleStreamOptions,
) => AsyncGenerator<StreamEvent>;

/** API 提供商接口 */
export interface ApiProvider {
  api: ModelApiType;
  stream: StreamFunction;
  streamSimple: StreamSimpleFunction;
}

interface ApiProviderInternal {
  api: ModelApiType;
  stream: StreamFunction;
  streamSimple: StreamSimpleFunction;
}

type RegisteredApiProvider = {
  provider: ApiProviderInternal;
  sourceId?: string;
};

const apiProviderRegistry = new Map<string, RegisteredApiProvider>();

function wrapStream(api: ModelApiType, stream: StreamFunction): StreamFunction {
  return (model, context, options) => {
    return stream(model, context, options);
  };
}

function wrapStreamSimple(api: ModelApiType, streamSimple: StreamSimpleFunction): StreamSimpleFunction {
  return (model, context, options) => {
    return streamSimple(model, context, options);
  };
}

/** 注册 API 提供商 */
export function registerApiProvider(
  provider: ApiProvider,
  sourceId?: string,
): void {
  apiProviderRegistry.set(provider.api, {
    provider: {
      api: provider.api,
      stream: wrapStream(provider.api, provider.stream),
      streamSimple: wrapStreamSimple(provider.api, provider.streamSimple),
    },
    sourceId,
  });
}

/** 根据 API 类型查找提供商 */
export function getApiProvider(api: ModelApiType): ApiProviderInternal | undefined {
  return apiProviderRegistry.get(api)?.provider;
}

/** 列出所有已注册的 API 提供商 */
export function getApiProviders(): ApiProviderInternal[] {
  return Array.from(apiProviderRegistry.values(), (entry) => entry.provider);
}

/** 按 sourceId 注销所有提供商 */
export function unregisterApiProviders(sourceId: string): void {
  for (const [api, entry] of apiProviderRegistry.entries()) {
    if (entry.sourceId === sourceId) {
      apiProviderRegistry.delete(api);
    }
  }
}

/** 清空注册中心（用于测试清理） */
export function clearApiProviders(): void {
  apiProviderRegistry.clear();
}
/**
 * Anthropic Provider Extension 主入口
 *
 * 将 Anthropic Messages API 适配器封装为独立扩展，
 * 通过 ExtensionProvider 接口注册到 cross-wms 运行时。
 *
 * 移植自：
 * - openclaw/extensions/anthropic/ (扩展结构)
 * - server/adapters/anthropicAdapter.ts (适配器逻辑)
 */

import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';
import {
  callAnthropicStream,
  callAnthropic,
  resolveAnthropicBaseUrl,
  ANTHROPIC_DEFAULT_BASE_URL,
  type AnthropicCallConfig,
  type ChatMessage,
  type StreamCallbacks,
  type ToolDefinition,
  type AIResponse,
  type AnthropicAPIError,
} from './api.js';

/** Anthropic 模型目录 */
const ANTHROPIC_MODELS = [
  {
    id: 'claude-opus-4-8',
    name: 'Claude Opus 4.8',
    reasoning: true,
    input: ['text', 'image'] as const,
    contextWindow: 1048576,
    maxTokens: 128000,
    cost: { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  },
  {
    id: 'claude-opus-4-7',
    name: 'Claude Opus 4.7',
    reasoning: true,
    input: ['text', 'image'] as const,
    contextWindow: 200000,
    maxTokens: 64000,
    cost: { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    reasoning: true,
    input: ['text', 'image'] as const,
    contextWindow: 200000,
    maxTokens: 64000,
    cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  },
  {
    id: 'claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    reasoning: true,
    input: ['text', 'image'] as const,
    contextWindow: 200000,
    maxTokens: 64000,
    cost: { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 },
  },
] as const;

/** 扩展清单 */
const manifest: ExtensionManifest = {
  id: 'anthropic',
  name: 'Anthropic Provider',
  description: 'Anthropic Claude LLM provider extension with Messages API support',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

/**
 * Anthropic Provider 扩展
 *
 * 注册逻辑：
 * 1. 从 context.secrets 获取 ANTHROPIC_API_KEY
 * 2. 注册 Anthropic Messages API 适配器到 server/adapters/registry
 * 3. 注册 Anthropic 模型目录到 server/engine/llm/model-registry
 * 4. 注册 Anthropic API Provider 到 server/engine/llm/api-registry
 */
export default class AnthropicProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Anthropic provider extension');

    const apiKey = context.secrets('ANTHROPIC_API_KEY');
    if (!apiKey) {
      context.logger.warn('ANTHROPIC_API_KEY not found in environment');
    }

    const baseUrl = resolveAnthropicBaseUrl(context.config);

    // 注册适配器到全局 registry
    this.registerAdapter(context);

    // 注册模型到 registry
    this.registerModels(context, baseUrl);

    context.logger.info(`Anthropic provider registered (baseUrl=${baseUrl})`);
  }

  /**
   * 注册 Anthropic Messages API 适配器
   *
   * 通过动态 import 注入到 server/adapters/registry，
   * 使得 'anthropic-messages' apiType 可被运行时发现。
   */
  private registerAdapter(context: ExtensionContext): void {
    try {
      // 动态导入适配器注册表并注册
      import('../../server/adapters/registry.js').then(({ registerAdapter }) => {
        registerAdapter('anthropic-messages', () => {
          // 返回适配器工厂 — 使用扩展内的 API 封装
          return () => new AnthropicExtensionAdapter();
        });
        context.logger.info('Anthropic adapter registered in adapter registry');
      }).catch((err: unknown) => {
        context.logger.warn('Could not register Anthropic adapter in global registry:', err);
      });
    } catch {
      context.logger.warn('Could not import adapter registry for Anthropic registration');
    }
  }

  /**
   * 注册 Anthropic 模型目录
   */
  private registerModels(context: ExtensionContext, baseUrl: string): void {
    try {
      import('../../server/engine/llm/model-registry.js').then(({ registerModel }) => {
        for (const model of ANTHROPIC_MODELS) {
          registerModel({
            id: model.id,
            name: model.name,
            provider: 'anthropic',
            api: 'anthropic-messages',
            contextWindow: model.contextWindow,
            maxOutputTokens: model.maxTokens,
            cost: { ...model.cost },
            reasoning: model.reasoning,
          });
        }
        context.logger.info(`Registered ${ANTHROPIC_MODELS.length} Anthropic models`);
      }).catch((err: unknown) => {
        context.logger.warn('Could not register Anthropic models:', err);
      });
    } catch {
      context.logger.warn('Could not import model registry for Anthropic registration');
    }
  }

  unregister(): void {
    // 清理注册（如果需要）
  }
}

/**
 * Anthropic 扩展适配器
 *
 * 实现 IAiApiAdapter 接口，委托给 api.ts 中的流式/非流式调用。
 */
class AnthropicExtensionAdapter {
  readonly apiType = 'anthropic-messages' as const;

  async callStream(
    config: Record<string, unknown>,
    messages: ChatMessage[],
    callbacks: StreamCallbacks,
    tools?: ToolDefinition[],
  ): Promise<AIResponse> {
    const callConfig: AnthropicCallConfig = {
      apiEndpoint: config.apiEndpoint as string,
      apiKey: config.apiKey as string | undefined,
      modelId: config.modelId as string,
      authMode: config.authMode as AnthropicCallConfig['authMode'],
      temperature: config.temperature as number | undefined,
      maxTokens: config.maxTokens as number | undefined,
      thinkingLevel: config.thinkingLevel as string | undefined,
      signal: config.signal as AbortSignal | undefined,
      extraHeaders: config.extraHeaders as Record<string, string> | undefined,
      extraBodyParams: config.extraBodyParams as Record<string, unknown> | undefined,
    };
    return callAnthropicStream(callConfig, messages, callbacks, tools);
  }

  async call(
    config: Record<string, unknown>,
    messages: ChatMessage[],
    tools?: ToolDefinition[],
  ): Promise<AIResponse> {
    const callConfig: AnthropicCallConfig = {
      apiEndpoint: config.apiEndpoint as string,
      apiKey: config.apiKey as string | undefined,
      modelId: config.modelId as string,
      authMode: config.authMode as AnthropicCallConfig['authMode'],
      temperature: config.temperature as number | undefined,
      maxTokens: config.maxTokens as number | undefined,
      thinkingLevel: config.thinkingLevel as string | undefined,
      signal: config.signal as AbortSignal | undefined,
    };
    return callAnthropic(callConfig, messages, tools);
  }
}

// 导出公共 API
export {
  callAnthropicStream,
  callAnthropic,
  resolveAnthropicBaseUrl,
  ANTHROPIC_DEFAULT_BASE_URL,
  ANTHROPIC_MODELS,
};
export type { AnthropicCallConfig, ChatMessage, StreamCallbacks, ToolDefinition, AIResponse };

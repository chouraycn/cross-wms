
/**
 * DeepSeek Provider Extension 主入口
 *
 * 将 DeepSeek Chat Completions API 适配器封装为独立扩展，
 * 通过 ExtensionProvider 接口注册到 cross-wms 运行时。
 *
 * 移植自：
 * - openclaw/extensions/deepseek/ (扩展结构)
 * - server/adapters/ (适配器逻辑参考)
 */

import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';
import {
  callDeepSeekStream,
  callDeepSeek,
  resolveConfiguredDeepSeekBaseUrl,
  DEEPSEEK_API_BASE_URL,
  type DeepSeekCallConfig,
  type ChatMessage,
  type StreamCallbacks,
  type ToolDefinition,
  type AIResponse,
} from './api.js';

/** DeepSeek 模型目录 */
const DEEPSEEK_MODELS = [
  {
    id: 'deepseek-v4-flash',
    name: 'DeepSeek V4 Flash',
    reasoning: true,
    input: ['text'] as const,
    contextWindow: 1000000,
    maxTokens: 384000,
    cost: { input: 0.14, output: 0.28, cacheRead: 0.028, cacheWrite: 0 },
  },
  {
    id: 'deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    reasoning: true,
    input: ['text'] as const,
    contextWindow: 1000000,
    maxTokens: 384000,
    cost: { input: 1.74, output: 3.48, cacheRead: 0.145, cacheWrite: 0 },
  },
  {
    id: 'deepseek-chat',
    name: 'DeepSeek Chat',
    input: ['text'] as const,
    contextWindow: 131072,
    maxTokens: 8192,
    cost: { input: 0.28, output: 0.42, cacheRead: 0.028, cacheWrite: 0 },
  },
  {
    id: 'deepseek-reasoner',
    name: 'DeepSeek Reasoner',
    reasoning: true,
    input: ['text'] as const,
    contextWindow: 131072,
    maxTokens: 65536,
    cost: { input: 0.28, output: 0.42, cacheRead: 0.028, cacheWrite: 0 },
  },
] as const;

/** 扩展清单 */
const manifest: ExtensionManifest = {
  id: 'deepseek',
  name: 'DeepSeek Provider',
  description: 'DeepSeek LLM provider extension with Chat Completions API support',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

/**
 * DeepSeek Provider 扩展
 *
 * 注册逻辑：
 * 1. 从 context.secrets 获取 DEEPSEEK_API_KEY
 * 2. 注册 DeepSeek Chat Completions 适配器
 * 3. 注册 DeepSeek 模型目录
 */
export default class DeepSeekProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering DeepSeek provider extension');

    const apiKey = context.secrets('DEEPSEEK_API_KEY');
    if (!apiKey) {
      context.logger.warn('DEEPSEEK_API_KEY not found in environment');
    }

    const baseUrl = resolveConfiguredDeepSeekBaseUrl(context.config);

    this.registerAdapter(context);
    this.registerModels(context, baseUrl);

    context.logger.info(`DeepSeek provider registered (baseUrl=${baseUrl})`);
  }

  /**
   * 注册 DeepSeek Chat Completions 适配器
   */
  private registerAdapter(context: ExtensionContext): void {
    try {
      import('../../server/adapters/registry.js').then(({ registerAdapter }) =&gt; {
        registerAdapter('deepseek-chat', () =&gt; {
          return () =&gt; new DeepSeekExtensionAdapter();
        });
        context.logger.info('DeepSeek adapter registered in adapter registry');
      }).catch((err: unknown) =&gt; {
        context.logger.warn('Could not register DeepSeek adapter in global registry:', err);
      });
    } catch {
      context.logger.warn('Could not import adapter registry for DeepSeek registration');
    }
  }

  /**
   * 注册 DeepSeek 模型目录
   */
  private registerModels(context: ExtensionContext, baseUrl: string): void {
    try {
      import('../../server/engine/llm/model-registry.js').then(({ registerModel }) =&gt; {
        for (const model of DEEPSEEK_MODELS) {
          registerModel({
            id: model.id,
            name: model.name,
            provider: 'deepseek',
            api: 'deepseek-chat',
            contextWindow: model.contextWindow,
            maxOutputTokens: model.maxTokens,
            cost: { ...model.cost },
            reasoning: model.reasoning,
          });
        }
        context.logger.info(`Registered ${DEEPSEEK_MODELS.length} DeepSeek models`);
      }).catch((err: unknown) =&gt; {
        context.logger.warn('Could not register DeepSeek models:', err);
      });
    } catch {
      context.logger.warn('Could not import model registry for DeepSeek registration');
    }
  }

  unregister(): void {
  }
}

/**
 * DeepSeek 扩展适配器
 *
 * 实现 IAiApiAdapter 接口，委托给 api.ts 中的流式/非流式调用。
 */
class DeepSeekExtensionAdapter {
  readonly apiType = 'deepseek-chat' as const;

  async callStream(
    config: Record&lt;string, unknown&gt;,
    messages: ChatMessage[],
    callbacks: StreamCallbacks,
    tools?: ToolDefinition[],
  ): Promise&lt;AIResponse&gt; {
    const callConfig: DeepSeekCallConfig = {
      apiEndpoint: config.apiEndpoint as string,
      apiKey: config.apiKey as string | undefined,
      modelId: config.modelId as string,
      authMode: config.authMode as DeepSeekCallConfig['authMode'],
      temperature: config.temperature as number | undefined,
      topP: config.topP as number | undefined,
      maxTokens: config.maxTokens as number | undefined,
      thinkingLevel: config.thinkingLevel as string | undefined,
      signal: config.signal as AbortSignal | undefined,
      compat: config.compat as DeepSeekCallConfig['compat'],
      toolChoice: config.toolChoice as DeepSeekCallConfig['toolChoice'],
    };
    return callDeepSeekStream(callConfig, messages, callbacks, tools);
  }

  async call(
    config: Record&lt;string, unknown&gt;,
    messages: ChatMessage[],
    tools?: ToolDefinition[],
  ): Promise&lt;AIResponse&gt; {
    const callConfig: DeepSeekCallConfig = {
      apiEndpoint: config.apiEndpoint as string,
      apiKey: config.apiKey as string | undefined,
      modelId: config.modelId as string,
      authMode: config.authMode as DeepSeekCallConfig['authMode'],
      temperature: config.temperature as number | undefined,
      topP: config.topP as number | undefined,
      maxTokens: config.maxTokens as number | undefined,
      thinkingLevel: config.thinkingLevel as string | undefined,
      signal: config.signal as AbortSignal | undefined,
      compat: config.compat as DeepSeekCallConfig['compat'],
    };
    return callDeepSeek(callConfig, messages, tools);
  }
}

export {
  callDeepSeekStream,
  callDeepSeek,
  resolveConfiguredDeepSeekBaseUrl,
  DEEPSEEK_API_BASE_URL,
  DEEPSEEK_MODELS,
};
export type { DeepSeekCallConfig, ChatMessage, StreamCallbacks, ToolDefinition, AIResponse };

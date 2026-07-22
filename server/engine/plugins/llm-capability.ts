/**
 * LLM 能力提供者 — 大语言模型调用能力
 *
 * 参考 openclaw/src/plugins/provider-runtime.ts 的能力分层：
 * - 插件可注册自定义 LLM 提供者（如自托管模型、特殊 API）
 * - 通过统一接口与 aiClient.ts 集成
 */

import type { CapabilityProvider } from './capability-provider.js';
import { capabilityProviderRegistry } from './capability-provider.js';
import { PluginCapabilityError } from './plugin-errors.js';

/** LLM 调用选项 */
export interface LlmInvokeOptions {
  /** 模型 ID */
  model: string;
  /** 提示词 */
  prompt: string;
  /** 系统提示 */
  systemPrompt?: string;
  /** 温度（0-2） */
  temperature?: number;
  /** 最大 token 数 */
  maxTokens?: number;
  /** 停止序列 */
  stop?: string[];
  /** 会话 ID */
  sessionId?: string;
}

/** LLM 调用结果 */
export interface LlmInvokeResult {
  /** 生成的文本 */
  text: string;
  /** 完成原因 */
  finishReason?: 'stop' | 'length' | 'content-filter' | 'tool-call';
  /** token 使用量 */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** 模型返回的元数据 */
  metadata?: Record<string, unknown>;
}

/** LLM 流式响应块 */
export interface LlmStreamChunk {
  /** 增量文本 */
  delta: string;
  /** 是否结束 */
  done: boolean;
  /** 完成原因（仅 done=true 时） */
  finishReason?: LlmInvokeResult['finishReason'];
}

/** LLM 能力提供者接口 */
export type LlmCapabilityProvider = CapabilityProvider<LlmInvokeOptions, LlmInvokeResult> & {
  /** 流式调用 */
  stream?(options: LlmInvokeOptions): AsyncIterable<LlmStreamChunk>;
  /** 列出可用模型 */
  listModels?(): Promise<string[]>;
};

// ===================== 注册与调用 =====================

/** 注册 LLM 能力提供者 */
export function registerLlmProvider(
  pluginId: string,
  provider: LlmCapabilityProvider,
  metadata?: Record<string, unknown>,
): void {
  capabilityProviderRegistry.register(pluginId, provider, metadata);
}

/** 注销 LLM 能力提供者 */
export function unregisterLlmProvider(providerId: string): boolean {
  return capabilityProviderRegistry.unregister('provider', providerId);
}

/** 调用 LLM */
export async function invokeLlm(
  providerId: string,
  options: LlmInvokeOptions,
): Promise<LlmInvokeResult> {
  const entry = capabilityProviderRegistry.find<LlmInvokeOptions, LlmInvokeResult>('provider', providerId);
  if (!entry) {
    throw new PluginCapabilityError(`未找到 LLM 提供者: ${providerId}`, `llm:${providerId}`);
  }
  return entry.provider.invoke(options);
}

/** 流式调用 LLM */
export async function* streamLlm(
  providerId: string,
  options: LlmInvokeOptions,
): AsyncIterable<LlmStreamChunk> {
  const entry = capabilityProviderRegistry.find<LlmInvokeOptions, LlmInvokeResult>('provider', providerId);
  if (!entry) {
    throw new PluginCapabilityError(`未找到 LLM 提供者: ${providerId}`, `llm:${providerId}`);
  }
  const provider = entry.provider as LlmCapabilityProvider;
  if (!provider.stream) {
    // 降级为非流式调用
    const result = await provider.invoke(options);
    yield { delta: result.text, done: true, finishReason: result.finishReason };
    return;
  }
  yield* provider.stream(options);
}

/** 列出所有 LLM 提供者 */
export function listLlmProviders() {
  return capabilityProviderRegistry.list('provider');
}

/** 创建 LLM 能力提供者 */
export function createLlmProvider(
  id: string,
  invokeFn: (options: LlmInvokeOptions) => Promise<LlmInvokeResult>,
  options: {
    displayName?: string;
    description?: string;
    stream?: (options: LlmInvokeOptions) => AsyncIterable<LlmStreamChunk>;
    listModels?: () => Promise<string[]>;
    healthCheck?: () => Promise<{ ok: boolean; error?: string }>;
  } = {},
): LlmCapabilityProvider {
  const provider: LlmCapabilityProvider = {
    kind: 'provider',
    id,
    ...(options.displayName !== undefined ? { displayName: options.displayName } : {}),
    ...(options.description !== undefined ? { description: options.description } : {}),
    invoke: invokeFn,
    ...(options.stream ? { stream: options.stream } : {}),
    ...(options.listModels ? { listModels: options.listModels } : {}),
    ...(options.healthCheck ? { healthCheck: options.healthCheck } : {}),
  };
  return provider;
}

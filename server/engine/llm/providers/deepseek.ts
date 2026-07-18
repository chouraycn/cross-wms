/**
 * DeepSeek Provider（国内）— OpenAI 兼容协议。
 *
 * baseUrl: https://api.deepseek.com/v1
 * 支持 deepseek-chat / deepseek-reasoner（思考模式）。
 *
 * DeepSeek-R1 (deepseek-reasoner) 思考模式：
 * - 思考内容在 `delta.reasoning_content` 字段（非 OpenAI 标准）
 * - 正式回复在 `delta.content` 字段
 * - 思考内容先于正文输出
 */
import type { StreamEvent } from '../types.js';
import type {
  Provider,
  ProviderFinishReasonMapper,
  ProviderHeaderBuilder,
  ProviderRequestBodyBuilder,
  ProviderStreamChunkParser,
  ProviderUsageParser,
} from './types.js';
import {
  buildOpenAIChatBody,
  buildOpenAICompatHeaders,
  mapOpenAIFinishReason,
  parseOpenAIUsage,
} from './openai-compat.js';

export const DEEPSEEK_PROVIDER_NAME = 'deepseek';

export const deepseekProviderInfo = {
  name: DEEPSEEK_PROVIDER_NAME,
  displayName: 'DeepSeek',
  region: 'cn' as const,
  envKeys: ['DEEPSEEK_API_KEY'],
  baseUrl: 'https://api.deepseek.com/v1',
  supportedApis: ['deepseek-chat'] as const,
  docsUrl: 'https://platform.deepseek.com/api-docs',
  defaultModels: [
    {
      id: 'deepseek-chat',
      name: 'DeepSeek-V3',
      api: 'deepseek-chat' as const,
      contextWindow: 64_000,
      maxOutputTokens: 8_192,
      cost: { input: 0.27, output: 1.1, cacheRead: 0.07, cacheWrite: 0 },
      capabilities: ['function-calling', 'json-mode'],
    },
    {
      id: 'deepseek-reasoner',
      name: 'DeepSeek-R1',
      api: 'deepseek-chat' as const,
      contextWindow: 64_000,
      maxOutputTokens: 32_768,
      cost: { input: 0.55, output: 2.19, cacheRead: 0.14, cacheWrite: 0 },
      reasoning: true,
      capabilities: ['function-calling', 'json-mode', 'thinking'],
    },
  ],
};

export const buildDeepSeekHeaders: ProviderHeaderBuilder = (ctx) =>
  buildOpenAICompatHeaders(ctx);

export const buildDeepSeekRequestBody: ProviderRequestBodyBuilder = (ctx) =>
  buildOpenAIChatBody(ctx);

/**
 * 解析 DeepSeek 流式 chunk。
 *
 * 在标准 OpenAI 格式基础上，额外解析 `delta.reasoning_content` 字段
 * 用于 DeepSeek-R1 思考模式输出。
 */
export const parseDeepSeekStreamChunk: ProviderStreamChunkParser = (chunk) => {
  const events: StreamEvent[] = [];
  if (!chunk || typeof chunk !== 'object') return events;
  const data = chunk as {
    choices?: Array<{
      delta?: {
        content?: string;
        reasoning_content?: string;
        tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
      };
      finish_reason?: string | null;
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      prompt_tokens_details?: { cached_tokens?: number };
      completion_tokens_details?: { reasoning_tokens?: number };
    };
  };
  for (const choice of data.choices ?? []) {
    const delta = choice.delta;
    // 思考内容（R1 专用，先于正文输出）
    if (delta?.reasoning_content) {
      events.push({ type: 'thinking', content: delta.reasoning_content });
    }
    // 正文
    if (delta?.content) {
      events.push({ type: 'text', content: delta.content });
    }
    // 工具调用
    if (delta?.tool_calls) {
      for (const call of delta.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        } catch {
          args = {};
        }
        events.push({
          type: 'tool_call',
          toolName: call.function.name,
          arguments: args,
        });
      }
    }
  }
  if (data.usage) {
    const reasoningTokens = data.usage.completion_tokens_details?.reasoning_tokens ?? 0;
    events.push({
      type: 'usage',
      usage: {
        input: data.usage.prompt_tokens ?? 0,
        output: data.usage.completion_tokens ?? 0,
        cacheRead: data.usage.prompt_tokens_details?.cached_tokens ?? 0,
        cacheWrite: 0,
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          // 将思考 token 计入输出（思考 token 也按输出计费）
          total: 0,
        },
      },
    });
    // 如果有思考 token，额外记录
    if (reasoningTokens > 0) {
      events.push({
        type: 'usage',
        usage: {
          input: 0,
          output: reasoningTokens,
          cacheRead: 0,
          cacheWrite: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      });
    }
  }
  return events;
};

export const parseDeepSeekUsage: ProviderUsageParser = parseOpenAIUsage;
export const mapDeepSeekFinishReason: ProviderFinishReasonMapper = mapOpenAIFinishReason as ProviderFinishReasonMapper;

export const deepseekProvider: Provider = {
  info: deepseekProviderInfo,
  buildHeaders: buildDeepSeekHeaders,
  buildRequestBody: buildDeepSeekRequestBody,
  parseStreamChunk: parseDeepSeekStreamChunk,
  parseUsage: parseDeepSeekUsage,
  mapFinishReason: mapDeepSeekFinishReason,
};

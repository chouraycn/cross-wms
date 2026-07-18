/**
 * OpenAI Provider — 支持 Chat Completions 与 Responses API。
 *
 * 该模块仅提供纯函数（构建请求头/请求体、解析 chunk/usage/finish_reason），
 * 不直接发起网络请求，便于单元测试。Responses API 通过 `options.tools`
 * 等触发函数调用；视觉通过模型 capabilities 声明。
 */
import type { CompleteOptions, Model, StreamEvent } from '../types.js';
import type {
  Provider,
  ProviderFinishReasonMapper,
  ProviderHeaderBuilder,
  ProviderRequestBodyBuilder,
  ProviderRequestContext,
  ProviderStreamChunkParser,
  ProviderUsageParser,
} from './types.js';
import {
  buildOpenAIChatBody,
  buildOpenAICompatHeaders,
  mapOpenAIFinishReason,
  parseOpenAIChatStreamChunk,
  parseOpenAIUsage,
} from './openai-compat.js';

export const OPENAI_PROVIDER_NAME = 'openai';

export const openaiProviderInfo = {
  name: OPENAI_PROVIDER_NAME,
  displayName: 'OpenAI',
  region: 'global' as const,
  envKeys: ['OPENAI_API_KEY'],
  baseUrl: 'https://api.openai.com/v1',
  supportedApis: ['openai-completions', 'openai-responses'] as const,
  docsUrl: 'https://platform.openai.com/docs/api-reference',
  defaultModels: [
    {
      id: 'gpt-4o',
      name: 'GPT-4o',
      api: 'openai-completions' as const,
      contextWindow: 128_000,
      maxOutputTokens: 16_384,
      cost: { input: 2.5, output: 10, cacheRead: 1.25, cacheWrite: 0 },
      capabilities: ['vision', 'function-calling', 'json-mode'],
    },
    {
      id: 'gpt-4o-mini',
      name: 'GPT-4o mini',
      api: 'openai-completions' as const,
      contextWindow: 128_000,
      maxOutputTokens: 16_384,
      cost: { input: 0.15, output: 0.6, cacheRead: 0.075, cacheWrite: 0 },
      capabilities: ['vision', 'function-calling', 'json-mode'],
    },
    {
      id: 'o1',
      name: 'o1',
      api: 'openai-responses' as const,
      contextWindow: 200_000,
      maxOutputTokens: 100_000,
      cost: { input: 15, output: 60, cacheRead: 7.5, cacheWrite: 0 },
      reasoning: true,
      capabilities: ['vision', 'function-calling', 'json-mode'],
    },
  ],
};

/** 构建 OpenAI Chat Completions 请求头。 */
export const buildOpenAIHeaders: ProviderHeaderBuilder = (ctx) =>
  buildOpenAICompatHeaders(ctx, { 'OpenAI-Beta': 'responses=experimental' });

/** 构建 OpenAI 请求体（根据 model.api 选择 Chat 或 Responses）。 */
export const buildOpenAIRequestBody: ProviderRequestBodyBuilder = (ctx) => {
  if (ctx.model.api === 'openai-responses') {
    return buildOpenAIResponsesBody(ctx);
  }
  return buildOpenAIChatBody(ctx);
};

/** Responses API 请求体（精简版，输入仍使用 messages 数组）。 */
function buildOpenAIResponsesBody(ctx: ProviderRequestContext): Record<string, unknown> {
  const { model, options } = ctx;
  const body: Record<string, unknown> = {
    model: model.id,
    input: options.messages.map((m) => ({
      role: m.role,
      content: [{ type: 'input_text', text: m.content }],
    })),
  };
  if (options.temperature !== undefined) body.temperature = options.temperature;
  if (options.maxTokens !== undefined) body.max_output_tokens = options.maxTokens;
  if (options.thinkingLevel && options.thinkingLevel !== 'off') {
    body.reasoning = { effort: mapThinkingLevelToEffort(options.thinkingLevel) };
  }
  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools.map((t) => ({
      type: 'function',
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }
  return body;
}

function mapThinkingLevelToEffort(level: string): string {
  const map: Record<string, string> = {
    minimal: 'low',
    low: 'low',
    medium: 'medium',
    high: 'high',
    xhigh: 'high',
    max: 'high',
  };
  return map[level] ?? 'medium';
}

/** 解析 Responses API 流式 chunk。 */
export const parseOpenAIResponsesStreamChunk: ProviderStreamChunkParser = (chunk) => {
  const events: StreamEvent[] = [];
  if (!chunk || typeof chunk !== 'object') return events;
  const data = chunk as {
    type?: string;
    delta?: string;
    response?: { output?: Array<{ type: string; name?: string; arguments?: string }> };
    usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } };
  };
  if (data.type === 'response.output_text.delta' && data.delta) {
    events.push({ type: 'text', content: data.delta });
  }
  if (data.type === 'response.function_call_arguments.done' && data.response?.output) {
    for (const out of data.response.output) {
      if (out.type === 'function_call' && out.name) {
        let args: Record<string, unknown> = {};
        try {
          args = out.arguments ? JSON.parse(out.arguments) : {};
        } catch {
          args = {};
        }
        events.push({ type: 'tool_call', toolName: out.name, arguments: args });
      }
    }
  }
  if (data.usage) {
    events.push({
      type: 'usage',
      usage: {
        input: data.usage.input_tokens ?? 0,
        output: data.usage.output_tokens ?? 0,
        cacheRead: data.usage.input_tokens_details?.cached_tokens ?? 0,
        cacheWrite: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
    });
  }
  return events;
};

/** OpenAI Responses usage 解析。 */
export const parseOpenAIResponsesUsage: ProviderUsageParser = (data) => {
  if (!data || typeof data !== 'object') {
    return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  }
  const usage = (data as {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
  });
  return {
    input: usage.input_tokens ?? 0,
    output: usage.output_tokens ?? 0,
    cacheRead: usage.input_tokens_details?.cached_tokens ?? 0,
    cacheWrite: 0,
  };
};

/** OpenAI Provider 完整描述。 */
export const openaiProvider: Provider = {
  info: openaiProviderInfo,
  buildHeaders: buildOpenAIHeaders,
  buildRequestBody: buildOpenAIRequestBody,
  parseStreamChunk: (chunk) => {
    // 简化：两个 API 都尝试解析；Chat 格式优先
    const chatEvents = parseOpenAIChatStreamChunk(chunk);
    if (chatEvents.length > 0) return chatEvents;
    return parseOpenAIResponsesStreamChunk(chunk);
  },
  parseUsage: (data) => {
    const chat = parseOpenAIUsage(data);
    if (chat.input > 0 || chat.output > 0) return chat;
    return parseOpenAIResponsesUsage(data);
  },
  mapFinishReason: mapOpenAIFinishReason as ProviderFinishReasonMapper,
};

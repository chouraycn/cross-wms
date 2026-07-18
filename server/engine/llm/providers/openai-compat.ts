/**
 * OpenAI 兼容协议基础工具。
 *
 * DeepSeek / Moonshot / Qwen / Zhipu / Baichuan 等国内厂商均采用与 OpenAI
 * Chat Completions 兼容的协议，仅在 baseUrl / 鉴权 / 模型 ID 上有差异。
 * 此模块抽取共享逻辑，被各 Provider 复用以减少重复。
 */
import type { CompleteOptions, Model, StreamEvent } from '../types.js';
import type {
  ProviderFinishReasonMapper,
  ProviderHeaderBuilder,
  ProviderRequestBodyBuilder,
  ProviderRequestContext,
  ProviderStreamChunkParser,
  ProviderUsageParser,
} from './types.js';

/** 标准 OpenAI Chat Completions 消息格式。 */
export type OpenAIChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
};

/** 将统一 CompleteOptions 转换为 OpenAI Chat Completions 请求体。 */
export function buildOpenAIChatBody(ctx: ProviderRequestContext): Record<string, unknown> {
  const { model, options } = ctx;
  const body: Record<string, unknown> = {
    model: model.id,
    messages: options.messages.map((m) => ({ role: m.role, content: m.content })),
  };
  if (options.temperature !== undefined) body.temperature = options.temperature;
  if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;
  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }
  if (options.tools && options.tools.length > 0) {
    body.tool_choice = 'auto';
  }
  return body;
}

/** 标准 Bearer 鉴权头。 */
export function buildOpenAICompatHeaders(
  ctx: ProviderRequestContext,
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    Authorization: `Bearer ${ctx.apiKey}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

/** 解析 OpenAI 兼容的流式 chunk（delta 文本 + tool_calls + usage）。 */
export function parseOpenAIChatStreamChunk(chunk: unknown): StreamEvent[] {
  const events: StreamEvent[] = [];
  if (!chunk || typeof chunk !== 'object') return events;
  const data = chunk as {
    choices?: Array<{
      delta?: { content?: string; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> };
      finish_reason?: string | null;
    }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
  };
  const choices = data.choices ?? [];
  for (const choice of choices) {
    const delta = choice.delta;
    if (delta?.content) {
      events.push({ type: 'text', content: delta.content });
    }
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
    const usage = {
      input: data.usage.prompt_tokens ?? 0,
      output: data.usage.completion_tokens ?? 0,
      cacheRead: data.usage.prompt_tokens_details?.cached_tokens ?? 0,
      cacheWrite: 0,
    };
    events.push({ type: 'usage', usage: makeUsage(usage) });
  }
  return events;
}

/** 解析 OpenAI 兼容的 usage 字段。 */
export function parseOpenAIUsage(
  data: unknown,
): { input: number; output: number; cacheRead: number; cacheWrite: number } {
  if (!data || typeof data !== 'object') {
    return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  }
  const usage = (data as {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  });
  return {
    input: usage.prompt_tokens ?? 0,
    output: usage.completion_tokens ?? 0,
    cacheRead: usage.prompt_tokens_details?.cached_tokens ?? 0,
    cacheWrite: 0,
  };
}

/** OpenAI finish_reason 映射。 */
export const mapOpenAIFinishReason: ProviderFinishReasonMapper = (reason) => {
  if (reason === 'stop') return 'stop';
  if (reason === 'length') return 'length';
  if (reason === 'tool_calls' || reason === 'function_call') return 'tool_call';
  if (reason === 'content_filter') return 'error';
  return 'unknown';
};

/** 构造一个空的 usage（含 cost 子结构）。 */
function makeUsage(tokens: {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}) {
  return {
    input: tokens.input,
    output: tokens.output,
    cacheRead: tokens.cacheRead,
    cacheWrite: tokens.cacheWrite,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

/** 工厂：根据 baseUrl + 额外 header 构造一组 OpenAI 兼容的请求构造器。 */
export function makeOpenAICompatBuilders(opts: {
  defaultBaseUrl: string;
  extraHeaders?: Record<string, string>;
}): {
  buildHeaders: ProviderHeaderBuilder;
  buildRequestBody: ProviderRequestBodyBuilder;
} {
  return {
    buildHeaders: (ctx) =>
      buildOpenAICompatHeaders(ctx, opts.extraHeaders ?? {}),
    buildRequestBody: (ctx) => {
      const body = buildOpenAIChatBody(ctx);
      return body;
    },
  };
}

/** 提取 OpenAI 兼容响应中的纯文本（用于 complete 路径）。 */
export function extractOpenAIChatText(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const choices = (data as { choices?: Array<{ message?: { content?: string } }> }).choices ?? [];
  return choices.map((c) => c.message?.content ?? '').join('');
}

/** 校验模型是否声明了某能力。 */
export function modelHasCapability(model: Model, capability: string): boolean {
  return model.capabilities?.includes(capability) ?? false;
}

export type {
  ProviderHeaderBuilder,
  ProviderRequestBodyBuilder,
  ProviderStreamChunkParser,
  ProviderUsageParser,
};

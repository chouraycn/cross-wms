/**
 * Anthropic Claude Provider — 消息格式 / 流式 / 思考模式 / 视觉。
 *
 * Anthropic 的 Messages API 与 OpenAI Chat Completions 在以下方面不同：
 * - system 是顶层字段而非 message role
 * - 流式事件以 `type` 标识（message_start / content_block_delta / message_delta）
 * - usage 分散在 message_start（input）与 message_delta（output）
 * - 思考模式通过 `thinking` 参数启用
 */
import type { CompleteOptions, StreamEvent } from '../types.js';
import type {
  Provider,
  ProviderFinishReasonMapper,
  ProviderHeaderBuilder,
  ProviderRequestBodyBuilder,
  ProviderRequestContext,
  ProviderStreamChunkParser,
  ProviderUsageParser,
} from './types.js';

export const ANTHROPIC_PROVIDER_NAME = 'anthropic';

const ANTHROPIC_API_VERSION = '2023-06-01';

export const anthropicProviderInfo = {
  name: ANTHROPIC_PROVIDER_NAME,
  displayName: 'Anthropic Claude',
  region: 'global' as const,
  envKeys: ['ANTHROPIC_API_KEY'],
  baseUrl: 'https://api.anthropic.com/v1',
  supportedApis: ['anthropic-messages'] as const,
  docsUrl: 'https://docs.anthropic.com/en/api/messages',
  defaultModels: [
    {
      id: 'claude-3-5-sonnet-20241022',
      name: 'Claude 3.5 Sonnet',
      api: 'anthropic-messages' as const,
      contextWindow: 200_000,
      maxOutputTokens: 8_192,
      cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
      capabilities: ['vision', 'function-calling', 'json-mode'],
    },
    {
      id: 'claude-3-5-haiku-20241022',
      name: 'Claude 3.5 Haiku',
      api: 'anthropic-messages' as const,
      contextWindow: 200_000,
      maxOutputTokens: 8_192,
      cost: { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 },
      capabilities: ['vision', 'function-calling', 'json-mode'],
    },
    {
      id: 'claude-3-7-sonnet-20250219',
      name: 'Claude 3.7 Sonnet',
      api: 'anthropic-messages' as const,
      contextWindow: 200_000,
      maxOutputTokens: 64_000,
      cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
      reasoning: true,
      capabilities: ['vision', 'function-calling', 'json-mode', 'thinking'],
    },
  ],
};

/** 构建 Anthropic 请求头：x-api-key + anthropic-version。 */
export const buildAnthropicHeaders: ProviderHeaderBuilder = (ctx) => ({
  'x-api-key': ctx.apiKey,
  'anthropic-version': ANTHROPIC_API_VERSION,
  'Content-Type': 'application/json',
});

/** 将统一 messages 拆分为 Anthropic 的 system + messages。 */
export function splitAnthropicSystemMessages(
  messages: CompleteOptions['messages'],
): { system: string; messages: Array<{ role: 'user' | 'assistant'; content: string }> } {
  const systemParts: string[] = [];
  const rest: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const m of messages) {
    if (m.role === 'system') {
      systemParts.push(m.content);
    } else if (m.role === 'user' || m.role === 'assistant') {
      rest.push({ role: m.role, content: m.content });
    } else if (m.role === 'tool') {
      // Anthropic 用 user 角色承载 tool_result
      rest.push({ role: 'user', content: m.content });
    }
  }
  return { system: systemParts.join('\n\n'), messages: rest };
}

/** 构建 Anthropic Messages 请求体。 */
export const buildAnthropicRequestBody: ProviderRequestBodyBuilder = (ctx) => {
  const { model, options } = ctx;
  const { system, messages } = splitAnthropicSystemMessages(options.messages);
  const body: Record<string, unknown> = {
    model: model.id,
    max_tokens: options.maxTokens ?? model.maxOutputTokens ?? 4096,
    messages,
  };
  if (system) body.system = system;
  if (options.temperature !== undefined) body.temperature = options.temperature;
  if (options.thinkingLevel && options.thinkingLevel !== 'off' && model.reasoning) {
    const budgetMap: Record<string, number> = {
      minimal: 1024,
      low: 2048,
      medium: 4096,
      high: 8192,
      xhigh: 16384,
      max: 32000,
    };
    body.thinking = { type: 'enabled', budget_tokens: budgetMap[options.thinkingLevel] ?? 4096 };
  }
  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
  }
  return body;
};

/** 解析 Anthropic 流式事件。 */
export const parseAnthropicStreamChunk: ProviderStreamChunkParser = (chunk) => {
  const events: StreamEvent[] = [];
  if (!chunk || typeof chunk !== 'object') return events;
  const data = chunk as {
    type?: string;
    message?: { usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } };
    delta?: {
      type?: string;
      text?: string;
      partial_json?: string;
    };
    content_block?: { type?: string; name?: string };
    usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
  };
  switch (data.type) {
    case 'message_start': {
      const u = data.message?.usage;
      if (u) {
        events.push({
          type: 'usage',
          usage: {
            input: u.input_tokens ?? 0,
            output: u.output_tokens ?? 0,
            cacheRead: u.cache_read_input_tokens ?? 0,
            cacheWrite: u.cache_creation_input_tokens ?? 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
        });
      }
      break;
    }
    case 'content_block_start': {
      if (data.content_block?.type === 'tool_use' && data.content_block.name) {
        events.push({
          type: 'tool_call',
          toolName: data.content_block.name,
          arguments: {},
        });
      }
      break;
    }
    case 'content_block_delta': {
      if (data.delta?.type === 'text_delta' && data.delta.text) {
        events.push({ type: 'text', content: data.delta.text });
      }
      if (data.delta?.type === 'input_json_delta' && data.delta.partial_json) {
        // 工具参数增量片段；这里不拼装，仅作占位
        try {
          const args = JSON.parse(data.delta.partial_json);
          events.push({ type: 'tool_call', toolName: '', arguments: args });
        } catch {
          // 部分 JSON，跳过
        }
      }
      break;
    }
    case 'message_delta': {
      if (data.usage) {
        events.push({
          type: 'usage',
          usage: {
            input: data.usage.input_tokens ?? 0,
            output: data.usage.output_tokens ?? 0,
            cacheRead: data.usage.cache_read_input_tokens ?? 0,
            cacheWrite: data.usage.cache_creation_input_tokens ?? 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
        });
      }
      break;
    }
  }
  return events;
};

/** 解析 Anthropic 非流式响应 usage。 */
export const parseAnthropicUsage: ProviderUsageParser = (data) => {
  if (!data || typeof data !== 'object') {
    return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  }
  const usage = (data as {
    usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
  }).usage;
  if (!usage) return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  return {
    input: usage.input_tokens ?? 0,
    output: usage.output_tokens ?? 0,
    cacheRead: usage.cache_read_input_tokens ?? 0,
    cacheWrite: usage.cache_creation_input_tokens ?? 0,
  };
};

/** Anthropic stop_reason 映射。 */
export const mapAnthropicFinishReason: ProviderFinishReasonMapper = (reason) => {
  if (reason === 'end_turn') return 'stop';
  if (reason === 'max_tokens') return 'length';
  if (reason === 'tool_use') return 'tool_call';
  if (reason === 'stop_sequence') return 'stop';
  return 'unknown';
};

export const anthropicProvider: Provider = {
  info: anthropicProviderInfo,
  buildHeaders: buildAnthropicHeaders,
  buildRequestBody: buildAnthropicRequestBody,
  parseStreamChunk: parseAnthropicStreamChunk,
  parseUsage: parseAnthropicUsage,
  mapFinishReason: mapAnthropicFinishReason,
};

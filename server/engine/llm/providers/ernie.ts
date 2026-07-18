/**
 * 百度文心一言（ERNIE）Provider（国内）— 百度自有协议。
 *
 * baseUrl: https://qianfan.baidubce.com/v2
 * 支持 ERNIE-4.0 / ERNIE-3.5 / ERNIE-Speed / ERNIE-Lite 等。
 * 文心一言使用 Bearer 鉴权（access_token 模式已废弃，V2 使用 API Key）。
 */
import type {
  Provider,
  ProviderFinishReasonMapper,
  ProviderHeaderBuilder,
  ProviderRequestBodyBuilder,
  ProviderStreamChunkParser,
  ProviderUsageParser,
} from './types.js';
import {
  buildOpenAICompatHeaders,
  parseOpenAIUsage,
  mapOpenAIFinishReason,
} from './openai-compat.js';
import type { StreamEvent } from '../types.js';

export const ERNIE_PROVIDER_NAME = 'ernie';

export const ernieProviderInfo = {
  name: ERNIE_PROVIDER_NAME,
  displayName: '百度文心一言 (ERNIE)',
  region: 'cn' as const,
  envKeys: ['ERNIE_API_KEY', 'BAIDU_API_KEY', 'QIANFAN_API_KEY'],
  baseUrl: 'https://qianfan.baidubce.com/v2',
  supportedApis: ['ernie-chat'] as const,
  docsUrl: 'https://cloud.baidu.com/doc/WENXINWORKSHOP/index.html',
  defaultModels: [
    {
      id: 'ernie-4.0-8k-latest',
      name: 'ERNIE 4.0',
      api: 'ernie-chat' as const,
      contextWindow: 8_192,
      maxOutputTokens: 4_096,
      cost: { input: 3, output: 9, cacheRead: 0, cacheWrite: 0 },
      capabilities: ['function-calling', 'json-mode'],
      aliases: ['ernie-4.0', 'ernie4', '文心4.0'],
    },
    {
      id: 'ernie-3.5-8k',
      name: 'ERNIE 3.5',
      api: 'ernie-chat' as const,
      contextWindow: 8_192,
      maxOutputTokens: 2_048,
      cost: { input: 1.2, output: 3.6, cacheRead: 0, cacheWrite: 0 },
      capabilities: ['function-calling', 'json-mode'],
      aliases: ['ernie-3.5', 'ernie3.5', '文心3.5'],
    },
    {
      id: 'ernie-speed-128k',
      name: 'ERNIE Speed 128K',
      api: 'ernie-chat' as const,
      contextWindow: 128_000,
      maxOutputTokens: 4_096,
      cost: { input: 0.4, output: 1.2, cacheRead: 0, cacheWrite: 0 },
      capabilities: ['function-calling'],
      aliases: ['ernie-speed', '文心speed'],
    },
    {
      id: 'ernie-lite-8k',
      name: 'ERNIE Lite 8K',
      api: 'ernie-chat' as const,
      contextWindow: 8_192,
      maxOutputTokens: 2_048,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      capabilities: ['function-calling'],
      aliases: ['ernie-lite', '文心lite'],
    },
  ],
};

export const buildErnieHeaders: ProviderHeaderBuilder = (ctx) =>
  buildOpenAICompatHeaders(ctx);

/** ERNIE 请求体（OpenAI 兼容，但 messages 中 user_id 可选用于合规审计）。 */
export const buildErnieRequestBody: ProviderRequestBodyBuilder = (ctx) => {
  const { model, options } = ctx;
  const body: Record<string, unknown> = {
    model: model.id,
    messages: options.messages.map((m) => ({ role: m.role, content: m.content })),
  };
  if (options.temperature !== undefined) body.temperature = options.temperature;
  if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;
  // 国内合规：传递 user_id 用于审计
  if (options.userId) body.user_id = options.userId;
  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
    body.tool_choice = 'auto';
  }
  return body;
};

/**
 * 解析 ERNIE 流式 chunk。
 *
 * ERNIE 流式格式与 OpenAI 类似，但：
 * - 文本在 `result` 而非 `delta.content`
 * - 思考内容在 `reasoning_content`（ERNIE 4.0 思考模式）
 * - finish_reason 在 `is_end` 字段
 */
export const parseErnieStreamChunk: ProviderStreamChunkParser = (chunk) => {
  const events: StreamEvent[] = [];
  if (!chunk || typeof chunk !== 'object') return events;
  const data = chunk as {
    result?: string;
    reasoning_content?: string;
    is_end?: boolean;
    function_call?: { name?: string; arguments?: string; thoughts?: string };
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  // 思考内容
  if (data.reasoning_content) {
    events.push({ type: 'thinking', content: data.reasoning_content });
  }
  // 正文
  if (data.result) {
    events.push({ type: 'text', content: data.result });
  }
  // 工具调用
  if (data.function_call?.name) {
    let args: Record<string, unknown> = {};
    try {
      args = data.function_call.arguments ? JSON.parse(data.function_call.arguments) : {};
    } catch {
      args = {};
    }
    events.push({ type: 'tool_call', toolName: data.function_call.name, arguments: args });
  }
  // usage
  if (data.usage) {
    events.push({
      type: 'usage',
      usage: {
        input: data.usage.prompt_tokens ?? 0,
        output: data.usage.completion_tokens ?? 0,
        cacheRead: 0,
        cacheWrite: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
    });
  }
  return events;
};

export const parseErnieUsage: ProviderUsageParser = (data) => {
  if (!data || typeof data !== 'object') {
    return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  }
  const usage = (data as { prompt_tokens?: number; completion_tokens?: number });
  return {
    input: usage.prompt_tokens ?? 0,
    output: usage.completion_tokens ?? 0,
    cacheRead: 0,
    cacheWrite: 0,
  };
};

export const mapErnieFinishReason: ProviderFinishReasonMapper = (reason) => {
  if (reason === 'stop' || reason === 'normal') return 'stop';
  if (reason === 'length') return 'length';
  if (reason === 'function_call') return 'tool_call';
  if (reason === 'content_filter' || reason === 'sensitive') return 'error';
  return 'unknown';
};

export const ernieProvider: Provider = {
  info: ernieProviderInfo,
  buildHeaders: buildErnieHeaders,
  buildRequestBody: buildErnieRequestBody,
  parseStreamChunk: parseErnieStreamChunk,
  parseUsage: parseErnieUsage,
  mapFinishReason: mapErnieFinishReason,
};

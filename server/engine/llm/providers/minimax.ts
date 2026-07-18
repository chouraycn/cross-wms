/**
 * MiniMax Provider（国内）— 自有协议（与 OpenAI 兼容但有差异）。
 *
 * baseUrl: https://api.minimax.chat/v1
 * - 文本对话：POST /text/chatcompletion_v2
 * - 流式响应：SSE，但字段命名与 OpenAI 不同
 *
 * MiniMax 特有字段：
 * - bot_setting: 机器人人设配置
 * - beams: 采样束宽度（默认 1）
 * - search_width: 搜索宽度
 * - reply_constraints: 回复约束
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
import { buildOpenAICompatHeaders } from './openai-compat.js';

export const MINIMAX_PROVIDER_NAME = 'minimax';

export const minimaxProviderInfo = {
  name: MINIMAX_PROVIDER_NAME,
  displayName: 'MiniMax',
  region: 'cn' as const,
  envKeys: ['MINIMAX_API_KEY', 'MINIMAX_GROUP_ID'],
  baseUrl: 'https://api.minimax.chat/v1',
  supportedApis: ['minimax-chat'] as const,
  docsUrl: 'https://platform.minimaxi.com/document',
  defaultModels: [
    {
      id: 'abab6.5s-chat',
      name: 'ABAB 6.5s',
      api: 'minimax-chat' as const,
      contextWindow: 245_760,
      maxOutputTokens: 4_096,
      cost: { input: 0.7, output: 0.7, cacheRead: 0, cacheWrite: 0 },
      capabilities: ['function-calling'],
    },
    {
      id: 'abab6.5-chat',
      name: 'ABAB 6.5',
      api: 'minimax-chat' as const,
      contextWindow: 8_192,
      maxOutputTokens: 2_048,
      cost: { input: 2.8, output: 2.8, cacheRead: 0, cacheWrite: 0 },
      capabilities: ['function-calling'],
    },
  ],
};

export const buildMinimaxHeaders: ProviderHeaderBuilder = (ctx) =>
  buildOpenAICompatHeaders(ctx);

/**
 * 构建 MiniMax 请求体。
 *
 * 与 OpenAI 兼容，但支持 MiniMax 特有的 bot_setting / beams 字段。
 * 如果 system 消息存在，会自动转换为 bot_setting 格式。
 */
export const buildMinimaxRequestBody: ProviderRequestBodyBuilder = (ctx) => {
  const { model, options } = ctx;
  const body: Record<string, unknown> = {
    model: model.id,
    messages: [],
    // MiniMax 默认配置
    beams: 1, // 采样束宽度
    search_width: 1, // 搜索宽度
  };

  // 提取 system 消息并转换为 bot_setting
  const systemMessages: Array<{ role: string; content: string }> = [];
  const otherMessages: Array<{ role: string; content: string }> = [];
  for (const m of options.messages) {
    if (m.role === 'system') {
      systemMessages.push({ role: m.role, content: m.content });
    } else {
      otherMessages.push({ role: m.role, content: m.content });
    }
  }

  // MiniMax 使用 bot_setting 而非 system role
  if (systemMessages.length > 0) {
    body.bot_setting = systemMessages.map((m) => ({
      bot_name: 'AI助手',
      content: m.content,
    }));
  }

  body.messages = otherMessages.map((m) => ({ role: m.role, content: m.content }));

  if (options.temperature !== undefined) body.temperature = options.temperature;
  if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;

  // 工具调用
  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
    body.tool_choice = 'auto';
  }

  // 国内合规：传递 user_id 用于审计
  if (options.userId) body.user_id = options.userId;

  return body;
};

/** 解析 MiniMax 流式 chunk（choices[].delta.content）。 */
export const parseMinimaxStreamChunk: ProviderStreamChunkParser = (chunk) => {
  const events: StreamEvent[] = [];
  if (!chunk || typeof chunk !== 'object') return events;
  const data = chunk as {
    choices?: Array<{
      delta?: { content?: string; function_call?: { name?: string; arguments?: string } };
      finish_reason?: string;
    }>;
    usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number };
  };
  for (const choice of data.choices ?? []) {
    if (choice.delta?.content) {
      events.push({ type: 'text', content: choice.delta.content });
    }
    if (choice.delta?.function_call?.name) {
      let args: Record<string, unknown> = {};
      try {
        args = choice.delta.function_call.arguments ? JSON.parse(choice.delta.function_call.arguments) : {};
      } catch {
        args = {};
      }
      events.push({ type: 'tool_call', toolName: choice.delta.function_call.name, arguments: args });
    }
  }
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

export const parseMinimaxUsage: ProviderUsageParser = (data) => {
  if (!data || typeof data !== 'object') return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const usage = (data as { prompt_tokens?: number; completion_tokens?: number });
  return {
    input: usage.prompt_tokens ?? 0,
    output: usage.completion_tokens ?? 0,
    cacheRead: 0,
    cacheWrite: 0,
  };
};

export const mapMinimaxFinishReason: ProviderFinishReasonMapper = (reason) => {
  if (reason === 'stop') return 'stop';
  if (reason === 'length') return 'length';
  if (reason === 'function_call') return 'tool_call';
  return 'unknown';
};

export const minimaxProvider: Provider = {
  info: minimaxProviderInfo,
  buildHeaders: buildMinimaxHeaders,
  buildRequestBody: buildMinimaxRequestBody,
  parseStreamChunk: parseMinimaxStreamChunk,
  parseUsage: parseMinimaxUsage,
  mapFinishReason: mapMinimaxFinishReason,
};

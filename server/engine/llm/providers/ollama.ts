/**
 * Ollama Provider — 本地模型 / 流式 / 嵌入。
 *
 * Ollama 默认无鉴权，baseUrl 为 http://localhost:11434。
 * - 聊天：POST /api/chat（流式 NDJSON）
 * - 生成：POST /api/generate
 * - 嵌入：POST /api/embeddings
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

export const OLLAMA_PROVIDER_NAME = 'ollama';

export const ollamaProviderInfo = {
  name: OLLAMA_PROVIDER_NAME,
  displayName: 'Ollama (Local)',
  region: 'global' as const,
  envKeys: ['OLLAMA_API_KEY'],
  baseUrl: 'http://localhost:11434',
  supportedApis: ['ollama'] as const,
  docsUrl: 'https://github.com/ollama/ollama/blob/main/docs/api.md',
  defaultModels: [
    {
      id: 'llama3.1',
      name: 'Llama 3.1',
      api: 'ollama' as const,
      contextWindow: 128_000,
      maxOutputTokens: 4_096,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      capabilities: ['function-calling'],
    },
    {
      id: 'qwen2.5',
      name: 'Qwen 2.5',
      api: 'ollama' as const,
      contextWindow: 32_000,
      maxOutputTokens: 4_096,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      capabilities: [],
    },
  ],
};

/** Ollama 默认无鉴权，仅设置 Content-Type。 */
export const buildOllamaHeaders: ProviderHeaderBuilder = () => ({
  'Content-Type': 'application/json',
});

/** 构造 Ollama /api/chat 请求体。 */
export const buildOllamaRequestBody: ProviderRequestBodyBuilder = (ctx) => {
  const { model, options } = ctx;
  const body: Record<string, unknown> = {
    model: model.id,
    messages: options.messages.map((m) => ({ role: m.role, content: m.content })),
    stream: true,
  };
  if (options.temperature !== undefined) {
    body.options = { temperature: options.temperature };
  }
  if (options.maxTokens !== undefined) {
    body.options = { ...(body.options as Record<string, unknown>), num_predict: options.maxTokens };
  }
  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
  }
  return body;
};

/** 构造 Ollama 嵌入请求体。 */
export function buildOllamaEmbeddingBody(model: string, prompt: string): Record<string, unknown> {
  return { model, prompt };
}

/** 解析 Ollama NDJSON 流式 chunk。 */
export const parseOllamaStreamChunk: ProviderStreamChunkParser = (chunk) => {
  const events: StreamEvent[] = [];
  if (!chunk || typeof chunk !== 'object') return events;
  const data = chunk as {
    message?: { content?: string };
    response?: string;
    done?: boolean;
    prompt_eval_count?: number;
    eval_count?: number;
  };
  if (data.message?.content) {
    events.push({ type: 'text', content: data.message.content });
  }
  if (data.response) {
    events.push({ type: 'text', content: data.response });
  }
  if (data.done) {
    events.push({
      type: 'usage',
      usage: {
        input: data.prompt_eval_count ?? 0,
        output: data.eval_count ?? 0,
        cacheRead: 0,
        cacheWrite: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
    });
  }
  return events;
};

export const parseOllamaUsage: ProviderUsageParser = (data) => {
  if (!data || typeof data !== 'object') return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const d = data as { prompt_eval_count?: number; eval_count?: number };
  return {
    input: d.prompt_eval_count ?? 0,
    output: d.eval_count ?? 0,
    cacheRead: 0,
    cacheWrite: 0,
  };
};

export const mapOllamaFinishReason: ProviderFinishReasonMapper = (reason) => {
  if (reason === 'stop' || reason === true) return 'stop';
  if (reason === 'length') return 'length';
  return 'unknown';
};

export const ollamaProvider: Provider = {
  info: ollamaProviderInfo,
  buildHeaders: buildOllamaHeaders,
  buildRequestBody: buildOllamaRequestBody,
  parseStreamChunk: parseOllamaStreamChunk,
  parseUsage: parseOllamaUsage,
  mapFinishReason: mapOllamaFinishReason,
};

/**
 * AWS Bedrock Provider — 多模型 / 认证 / 流式。
 *
 * Bedrock 通过 SigV4 签名认证，URL 形如
 * `https://bedrock-runtime.{region}.amazonaws.com/model/{modelId}/invoke`
 * 或 `/invoke-with-response-stream`。
 *
 * 不同底层模型（Anthropic / Meta / Mistral / AI21）的请求体格式不同，
 * 此处仅提供请求体构造的统一入口与流式 chunk 解析的通用逻辑。
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

export const BEDROCK_PROVIDER_NAME = 'bedrock';

export const bedrockProviderInfo = {
  name: BEDROCK_PROVIDER_NAME,
  displayName: 'AWS Bedrock',
  region: 'global' as const,
  envKeys: ['AWS_ACCESS_KEY_ID', 'AWS_BEDROCK_API_KEY'],
  baseUrl: 'https://bedrock-runtime.us-east-1.amazonaws.com',
  supportedApis: ['aws-bedrock'] as const,
  docsUrl: 'https://docs.aws.amazon.com/bedrock/',
  defaultModels: [
    {
      id: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
      name: 'Claude 3.5 Sonnet (Bedrock)',
      api: 'aws-bedrock' as const,
      contextWindow: 200_000,
      maxOutputTokens: 8_192,
      cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
      capabilities: ['vision', 'function-calling', 'json-mode'],
    },
    {
      id: 'meta.llama3-1-70b-instruct-v1:0',
      name: 'Llama 3.1 70B (Bedrock)',
      api: 'aws-bedrock' as const,
      contextWindow: 128_000,
      maxOutputTokens: 2_048,
      cost: { input: 0.72, output: 0.72, cacheRead: 0, cacheWrite: 0 },
      capabilities: ['function-calling'],
    },
  ],
};

/** 构造 Bedrock 端点 URL。 */
export function buildBedrockEndpoint(params: {
  baseUrl?: string;
  modelId: string;
  region?: string;
  stream?: boolean;
}): string {
  const region = params.region ?? 'us-east-1';
  const base = params.baseUrl ?? `https://bedrock-runtime.${region}.amazonaws.com`;
  const action = params.stream ? 'invoke-with-response-stream' : 'invoke';
  return `${base}/model/${encodeURIComponent(params.modelId)}/${action}`;
}

/** Bedrock 头部：Authorization 由 SigV4 计算，此处仅占位。 */
export const buildBedrockHeaders: ProviderHeaderBuilder = () => ({
  'Content-Type': 'application/json',
});

/** 根据 modelId 前缀分发请求体构造。 */
export const buildBedrockRequestBody: ProviderRequestBodyBuilder = (ctx) => {
  const { model, options } = ctx;
  const id = model.id.toLowerCase();
  if (id.startsWith('anthropic.')) {
    return buildBedrockAnthropicBody(options);
  }
  if (id.startsWith('meta.')) {
    return buildBedrockLlamaBody(options);
  }
  if (id.startsWith('mistral.')) {
    return buildBedrockMistralBody(options);
  }
  // 默认回退到 Anthropic 风格
  return buildBedrockAnthropicBody(options);
};

function buildBedrockAnthropicBody(options: { messages: Array<{ role: string; content: string }>; maxTokens?: number; temperature?: number }): Record<string, unknown> {
  const system: string[] = [];
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const m of options.messages) {
    if (m.role === 'system') system.push(m.content);
    else if (m.role === 'user' || m.role === 'assistant') messages.push({ role: m.role, content: m.content });
  }
  const body: Record<string, unknown> = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: options.maxTokens ?? 4096,
    messages,
  };
  if (system.length > 0) body.system = system.join('\n\n');
  if (options.temperature !== undefined) body.temperature = options.temperature;
  return body;
}

function buildBedrockLlamaBody(options: { messages: Array<{ role: string; content: string }>; maxTokens?: number; temperature?: number }): Record<string, unknown> {
  const prompt = options.messages.map((m) => {
    const tag = m.role === 'assistant' ? 'assistant' : 'user';
    return `<|start_header_id|>${tag}<|end_header_id|>\n\n${m.content}<|eot_id|>`;
  }).join('');
  return {
    prompt,
    max_gen_len: options.maxTokens ?? 2048,
    temperature: options.temperature ?? 0.7,
  };
}

function buildBedrockMistralBody(options: { messages: Array<{ role: string; content: string }>; maxTokens?: number; temperature?: number }): Record<string, unknown> {
  return {
    messages: options.messages.map((m) => ({ role: m.role, content: m.content })),
    max_tokens: options.maxTokens ?? 1024,
    temperature: options.temperature ?? 0.7,
  };
}

/** Bedrock 流式 chunk 通过 eventStream 编码，payload 是 base64 解码后的 JSON。 */
export const parseBedrockStreamChunk: ProviderStreamChunkParser = (chunk) => {
  const events: StreamEvent[] = [];
  if (!chunk || typeof chunk !== 'object') return events;
  // chunk 可能是 { bytes: string } 或 { payload: ... } 或直接 JSON
  const data = (chunk as { bytes?: string; payload?: unknown }).payload ?? chunk;
  const json = typeof data === 'string' ? safeJsonParse(data) : data;
  if (!json || typeof json !== 'object') return events;
  const obj = json as {
    type?: string;
    delta?: { type?: string; text?: string };
    message?: { usage?: { input_tokens?: number; output_tokens?: number } };
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  if (obj.delta?.text) {
    events.push({ type: 'text', content: obj.delta.text });
  }
  if (obj.message?.usage || obj.usage) {
    const u = obj.message?.usage ?? obj.usage!;
    events.push({
      type: 'usage',
      usage: {
        input: u.input_tokens ?? 0,
        output: u.output_tokens ?? 0,
        cacheRead: 0,
        cacheWrite: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
    });
  }
  return events;
};

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

/** Bedrock usage 解析。 */
export const parseBedrockUsage: ProviderUsageParser = (data) => {
  if (!data || typeof data !== 'object') return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const usage = (data as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
  return {
    input: usage?.input_tokens ?? 0,
    output: usage?.output_tokens ?? 0,
    cacheRead: 0,
    cacheWrite: 0,
  };
};

export const mapBedrockFinishReason: ProviderFinishReasonMapper = (reason) => {
  if (reason === 'end_turn' || reason === 'stop') return 'stop';
  if (reason === 'max_tokens') return 'length';
  if (reason === 'tool_use') return 'tool_call';
  return 'unknown';
};

export const bedrockProvider: Provider = {
  info: bedrockProviderInfo,
  buildHeaders: buildBedrockHeaders,
  buildRequestBody: buildBedrockRequestBody,
  parseStreamChunk: parseBedrockStreamChunk,
  parseUsage: parseBedrockUsage,
  mapFinishReason: mapBedrockFinishReason,
};

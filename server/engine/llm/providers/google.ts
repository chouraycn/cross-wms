/**
 * Google Gemini Provider — 生成 / 聊天 / 视觉 / 函数。
 *
 * Gemini 使用 generateContent / streamGenerateContent 端点，
 * system 指令通过 `systemInstruction` 字段传递，函数调用通过
 * `functionDeclarations` 配置。
 */
import type { StreamEvent } from '../types.js';
import type {
  Provider,
  ProviderFinishReasonMapper,
  ProviderHeaderBuilder,
  ProviderRequestBodyBuilder,
  ProviderRequestContext,
  ProviderStreamChunkParser,
  ProviderUsageParser,
} from './types.js';

export const GOOGLE_PROVIDER_NAME = 'google';

export const googleProviderInfo = {
  name: GOOGLE_PROVIDER_NAME,
  displayName: 'Google Gemini',
  region: 'global' as const,
  envKeys: ['GOOGLE_API_KEY', 'GEMINI_API_KEY'],
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  supportedApis: ['google-gemini'] as const,
  docsUrl: 'https://ai.google.dev/api',
  defaultModels: [
    {
      id: 'gemini-1.5-pro',
      name: 'Gemini 1.5 Pro',
      api: 'google-gemini' as const,
      contextWindow: 2_097_152,
      maxOutputTokens: 8_192,
      cost: { input: 1.25, output: 5, cacheRead: 0.3125, cacheWrite: 0 },
      capabilities: ['vision', 'function-calling', 'json-mode'],
    },
    {
      id: 'gemini-1.5-flash',
      name: 'Gemini 1.5 Flash',
      api: 'google-gemini' as const,
      contextWindow: 1_048_576,
      maxOutputTokens: 8_192,
      cost: { input: 0.075, output: 0.3, cacheRead: 0.01875, cacheWrite: 0 },
      capabilities: ['vision', 'function-calling', 'json-mode'],
    },
    {
      id: 'gemini-2.0-flash',
      name: 'Gemini 2.0 Flash',
      api: 'google-gemini' as const,
      contextWindow: 1_048_576,
      maxOutputTokens: 8_192,
      cost: { input: 0.1, output: 0.4, cacheRead: 0.025, cacheWrite: 0 },
      capabilities: ['vision', 'function-calling', 'json-mode'],
    },
  ],
};

/** Gemini 通过 query param 传递 API key。 */
export const buildGoogleHeaders: ProviderHeaderBuilder = () => ({
  'Content-Type': 'application/json',
});

/** 构造 Gemini 端点 URL（含 model + api key）。 */
export function buildGoogleEndpoint(ctx: ProviderRequestContext, stream = false): string {
  const base = ctx.baseUrl ?? googleProviderInfo.baseUrl;
  const action = stream ? 'streamGenerateContent' : 'generateContent';
  const sep = base.includes('?') ? '&' : '?';
  return `${base}/models/${ctx.model.id}:${action}${sep}key=${encodeURIComponent(ctx.apiKey)}`;
}

/** 构造 Gemini 请求体：contents + systemInstruction + generationConfig。 */
export const buildGoogleRequestBody: ProviderRequestBodyBuilder = (ctx) => {
  const { model, options } = ctx;
  const systemParts: string[] = [];
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
  for (const m of options.messages) {
    if (m.role === 'system') {
      systemParts.push(m.content);
    } else {
      const role = m.role === 'assistant' ? 'model' : 'user';
      contents.push({ role, parts: [{ text: m.content }] });
    }
  }
  const body: Record<string, unknown> = { contents };
  if (systemParts.length > 0) {
    body.systemInstruction = { parts: [{ text: systemParts.join('\n\n') }] };
  }
  const generationConfig: Record<string, unknown> = {};
  if (options.temperature !== undefined) generationConfig.temperature = options.temperature;
  if (options.maxTokens !== undefined) generationConfig.maxOutputTokens = options.maxTokens;
  if (Object.keys(generationConfig).length > 0) body.generationConfig = generationConfig;
  if (options.tools && options.tools.length > 0) {
    body.tools = [
      {
        functionDeclarations: options.tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      },
    ];
  }
  return body;
};

/** 解析 Gemini 流式 chunk（数组形式，每项含 candidates）。 */
export const parseGoogleStreamChunk: ProviderStreamChunkParser = (chunk) => {
  const events: StreamEvent[] = [];
  if (!chunk) return events;
  const arr = Array.isArray(chunk) ? chunk : [chunk];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const data = item as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string; functionCall?: { name?: string; args?: Record<string, unknown> } }> };
        finishReason?: string;
      }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; cachedContentTokenCount?: number };
    };
    for (const cand of data.candidates ?? []) {
      const parts = cand.content?.parts ?? [];
      for (const p of parts) {
        if (p.text) events.push({ type: 'text', content: p.text });
        if (p.functionCall?.name) {
          events.push({
            type: 'tool_call',
            toolName: p.functionCall.name,
            arguments: p.functionCall.args ?? {},
          });
        }
      }
    }
    if (data.usageMetadata) {
      events.push({
        type: 'usage',
        usage: {
          input: data.usageMetadata.promptTokenCount ?? 0,
          output: data.usageMetadata.candidatesTokenCount ?? 0,
          cacheRead: data.usageMetadata.cachedContentTokenCount ?? 0,
          cacheWrite: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      });
    }
  }
  return events;
};

/** 解析 Gemini 非流式 usage。 */
export const parseGoogleUsage: ProviderUsageParser = (data) => {
  if (!data || typeof data !== 'object') {
    return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  }
  const meta = (data as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; cachedContentTokenCount?: number } }).usageMetadata;
  if (!meta) return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  return {
    input: meta.promptTokenCount ?? 0,
    output: meta.candidatesTokenCount ?? 0,
    cacheRead: meta.cachedContentTokenCount ?? 0,
    cacheWrite: 0,
  };
};

/** Gemini finishReason 映射。 */
export const mapGoogleFinishReason: ProviderFinishReasonMapper = (reason) => {
  if (reason === 'STOP') return 'stop';
  if (reason === 'MAX_TOKENS') return 'length';
  if (reason === 'SAFETY' || reason === 'RECITATION') return 'error';
  return 'unknown';
};

export const googleProvider: Provider = {
  info: googleProviderInfo,
  buildHeaders: buildGoogleHeaders,
  buildRequestBody: buildGoogleRequestBody,
  parseStreamChunk: parseGoogleStreamChunk,
  parseUsage: parseGoogleUsage,
  mapFinishReason: mapGoogleFinishReason,
};

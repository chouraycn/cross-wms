/**
 * Moonshot / Kimi Provider（国内）— OpenAI 兼容协议。
 *
 * baseUrl: https://api.moonshot.cn/v1
 * 支持 moonshot-v1-8k/32k/128k、kimi-k2 等。Kimi 支持思考模式。
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
  buildOpenAIChatBody,
  buildOpenAICompatHeaders,
  mapOpenAIFinishReason,
  parseOpenAIChatStreamChunk,
  parseOpenAIUsage,
} from './openai-compat.js';

export const MOONSHOT_PROVIDER_NAME = 'moonshot';

export const moonshotProviderInfo = {
  name: MOONSHOT_PROVIDER_NAME,
  displayName: 'Moonshot / Kimi',
  region: 'cn' as const,
  envKeys: ['MOONSHOT_API_KEY', 'KIMI_API_KEY'],
  baseUrl: 'https://api.moonshot.cn/v1',
  supportedApis: ['moonshot-chat'] as const,
  docsUrl: 'https://platform.moonshot.cn/docs',
  defaultModels: [
    {
      id: 'moonshot-v1-8k',
      name: 'Moonshot v1 8K',
      api: 'moonshot-chat' as const,
      contextWindow: 8_000,
      maxOutputTokens: 2_048,
      cost: { input: 1.7, output: 1.7, cacheRead: 0, cacheWrite: 0 },
      capabilities: ['function-calling', 'json-mode'],
    },
    {
      id: 'moonshot-v1-128k',
      name: 'Moonshot v1 128K',
      api: 'moonshot-chat' as const,
      contextWindow: 128_000,
      maxOutputTokens: 8_192,
      cost: { input: 8.5, output: 8.5, cacheRead: 0, cacheWrite: 0 },
      capabilities: ['function-calling', 'json-mode'],
    },
    {
      id: 'kimi-k2-0905-preview',
      name: 'Kimi K2',
      api: 'moonshot-chat' as const,
      contextWindow: 128_000,
      maxOutputTokens: 8_192,
      cost: { input: 1.7, output: 6.8, cacheRead: 0, cacheWrite: 0 },
      reasoning: true,
      capabilities: ['function-calling', 'json-mode', 'thinking'],
    },
  ],
};

export const buildMoonshotHeaders: ProviderHeaderBuilder = (ctx) =>
  buildOpenAICompatHeaders(ctx);

export const buildMoonshotRequestBody: ProviderRequestBodyBuilder = (ctx) =>
  buildOpenAIChatBody(ctx);

export const parseMoonshotStreamChunk: ProviderStreamChunkParser = parseOpenAIChatStreamChunk;
export const parseMoonshotUsage: ProviderUsageParser = parseOpenAIUsage;
export const mapMoonshotFinishReason: ProviderFinishReasonMapper = mapOpenAIFinishReason as ProviderFinishReasonMapper;

export const moonshotProvider: Provider = {
  info: moonshotProviderInfo,
  buildHeaders: buildMoonshotHeaders,
  buildRequestBody: buildMoonshotRequestBody,
  parseStreamChunk: parseMoonshotStreamChunk,
  parseUsage: parseMoonshotUsage,
  mapFinishReason: mapMoonshotFinishReason,
};

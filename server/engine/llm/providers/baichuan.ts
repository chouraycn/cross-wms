/**
 * 百川（Baichuan）Provider（国内）— OpenAI 兼容协议。
 *
 * baseUrl: https://api.baichuan-ai.com/v1
 * 支持 Baichuan4 / Baichuan3-Turbo / Baichuan-NPC 等。
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

export const BAICHUAN_PROVIDER_NAME = 'baichuan';

export const baichuanProviderInfo = {
  name: BAICHUAN_PROVIDER_NAME,
  displayName: '百川 Baichuan',
  region: 'cn' as const,
  envKeys: ['BAICHUAN_API_KEY'],
  baseUrl: 'https://api.baichuan-ai.com/v1',
  supportedApis: ['baichuan-chat'] as const,
  docsUrl: 'https://platform.baichuan-ai.com/docs',
  defaultModels: [
    {
      id: 'Baichuan4',
      name: 'Baichuan 4',
      api: 'baichuan-chat' as const,
      contextWindow: 32_768,
      maxOutputTokens: 4_096,
      cost: { input: 6, output: 6, cacheRead: 0, cacheWrite: 0 },
      capabilities: ['function-calling', 'json-mode'],
    },
    {
      id: 'Baichuan3-Turbo',
      name: 'Baichuan 3 Turbo',
      api: 'baichuan-chat' as const,
      contextWindow: 32_768,
      maxOutputTokens: 4_096,
      cost: { input: 1.2, output: 1.2, cacheRead: 0, cacheWrite: 0 },
      capabilities: ['function-calling', 'json-mode'],
    },
  ],
};

export const buildBaichuanHeaders: ProviderHeaderBuilder = (ctx) =>
  buildOpenAICompatHeaders(ctx);

export const buildBaichuanRequestBody: ProviderRequestBodyBuilder = (ctx) =>
  buildOpenAIChatBody(ctx);

export const parseBaichuanStreamChunk: ProviderStreamChunkParser = parseOpenAIChatStreamChunk;
export const parseBaichuanUsage: ProviderUsageParser = parseOpenAIUsage;
export const mapBaichuanFinishReason: ProviderFinishReasonMapper = mapOpenAIFinishReason as ProviderFinishReasonMapper;

export const baichuanProvider: Provider = {
  info: baichuanProviderInfo,
  buildHeaders: buildBaichuanHeaders,
  buildRequestBody: buildBaichuanRequestBody,
  parseStreamChunk: parseBaichuanStreamChunk,
  parseUsage: parseBaichuanUsage,
  mapFinishReason: mapBaichuanFinishReason,
};

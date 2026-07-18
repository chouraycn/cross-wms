/**
 * 零一万物（Yi）Provider（国内）— OpenAI 兼容协议。
 *
 * baseUrl: https://api.lingyiwanwu.com/v1
 * 支持 Yi-Lightning / Yi-Large / Yi-Medium / Yi-Spark 等。
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

export const YI_PROVIDER_NAME = 'yi';

export const yiProviderInfo = {
  name: YI_PROVIDER_NAME,
  displayName: '零一万物 (Yi)',
  region: 'cn' as const,
  envKeys: ['YI_API_KEY', 'LINGYIWANWU_API_KEY'],
  baseUrl: 'https://api.lingyiwanwu.com/v1',
  supportedApis: ['yi-chat'] as const,
  docsUrl: 'https://platform.lingyiwanwu.com/docs',
  defaultModels: [
    {
      id: 'yi-lightning',
      name: 'Yi Lightning',
      api: 'yi-chat' as const,
      contextWindow: 16_384,
      maxOutputTokens: 4_096,
      cost: { input: 0.99, output: 0.99, cacheRead: 0, cacheWrite: 0 },
      capabilities: ['function-calling', 'json-mode'],
      aliases: ['yi-lightning', '零一闪电'],
    },
    {
      id: 'yi-large',
      name: 'Yi Large',
      api: 'yi-chat' as const,
      contextWindow: 32_768,
      maxOutputTokens: 4_096,
      cost: { input: 20, output: 20, cacheRead: 0, cacheWrite: 0 },
      capabilities: ['function-calling', 'json-mode'],
      aliases: ['yi-large', '零一大模型'],
    },
    {
      id: 'yi-medium',
      name: 'Yi Medium',
      api: 'yi-chat' as const,
      contextWindow: 16_384,
      maxOutputTokens: 4_096,
      cost: { input: 2.5, output: 2.5, cacheRead: 0, cacheWrite: 0 },
      capabilities: ['function-calling'],
      aliases: ['yi-medium'],
    },
    {
      id: 'yi-spark',
      name: 'Yi Spark',
      api: 'yi-chat' as const,
      contextWindow: 16_384,
      maxOutputTokens: 4_096,
      cost: { input: 0.6, output: 0.6, cacheRead: 0, cacheWrite: 0 },
      capabilities: [],
      aliases: ['yi-spark'],
    },
  ],
};

export const buildYiHeaders: ProviderHeaderBuilder = (ctx) =>
  buildOpenAICompatHeaders(ctx);

export const buildYiRequestBody: ProviderRequestBodyBuilder = (ctx) =>
  buildOpenAIChatBody(ctx);

export const parseYiStreamChunk: ProviderStreamChunkParser = parseOpenAIChatStreamChunk;
export const parseYiUsage: ProviderUsageParser = parseOpenAIUsage;
export const mapYiFinishReason: ProviderFinishReasonMapper = mapOpenAIFinishReason as ProviderFinishReasonMapper;

export const yiProvider: Provider = {
  info: yiProviderInfo,
  buildHeaders: buildYiHeaders,
  buildRequestBody: buildYiRequestBody,
  parseStreamChunk: parseYiStreamChunk,
  parseUsage: parseYiUsage,
  mapFinishReason: mapYiFinishReason,
};

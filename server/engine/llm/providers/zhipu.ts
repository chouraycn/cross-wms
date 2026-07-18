/**
 * 智谱 GLM Provider（国内）— OpenAI 兼容协议。
 *
 * baseUrl: https://open.bigmodel.cn/api/paas/v4
 * 支持 glm-4 / glm-4-plus / glm-4-flash / glm-4v 等。
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

export const ZHIPU_PROVIDER_NAME = 'zhipu';

export const zhipuProviderInfo = {
  name: ZHIPU_PROVIDER_NAME,
  displayName: '智谱 GLM',
  region: 'cn' as const,
  envKeys: ['ZHIPU_API_KEY', 'GLM_API_KEY'],
  baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  supportedApis: ['zhipu-chat'] as const,
  docsUrl: 'https://open.bigmodel.cn/dev/api',
  defaultModels: [
    {
      id: 'glm-4-plus',
      name: 'GLM-4-Plus',
      api: 'zhipu-chat' as const,
      contextWindow: 128_000,
      maxOutputTokens: 4_096,
      cost: { input: 5, output: 5, cacheRead: 0, cacheWrite: 0 },
      capabilities: ['function-calling', 'json-mode'],
    },
    {
      id: 'glm-4',
      name: 'GLM-4',
      api: 'zhipu-chat' as const,
      contextWindow: 128_000,
      maxOutputTokens: 4_096,
      cost: { input: 1.5, output: 1.5, cacheRead: 0, cacheWrite: 0 },
      capabilities: ['function-calling', 'json-mode'],
    },
    {
      id: 'glm-4-flash',
      name: 'GLM-4-Flash',
      api: 'zhipu-chat' as const,
      contextWindow: 128_000,
      maxOutputTokens: 4_096,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      capabilities: ['function-calling', 'json-mode'],
    },
    {
      id: 'glm-4v',
      name: 'GLM-4V',
      api: 'zhipu-chat' as const,
      contextWindow: 2_048,
      maxOutputTokens: 1_024,
      cost: { input: 1.5, output: 1.5, cacheRead: 0, cacheWrite: 0 },
      capabilities: ['vision', 'function-calling'],
    },
  ],
};

export const buildZhipuHeaders: ProviderHeaderBuilder = (ctx) =>
  buildOpenAICompatHeaders(ctx);

export const buildZhipuRequestBody: ProviderRequestBodyBuilder = (ctx) =>
  buildOpenAIChatBody(ctx);

export const parseZhipuStreamChunk: ProviderStreamChunkParser = parseOpenAIChatStreamChunk;
export const parseZhipuUsage: ProviderUsageParser = parseOpenAIUsage;
export const mapZhipuFinishReason: ProviderFinishReasonMapper = mapOpenAIFinishReason as ProviderFinishReasonMapper;

export const zhipuProvider: Provider = {
  info: zhipuProviderInfo,
  buildHeaders: buildZhipuHeaders,
  buildRequestBody: buildZhipuRequestBody,
  parseStreamChunk: parseZhipuStreamChunk,
  parseUsage: parseZhipuUsage,
  mapFinishReason: mapZhipuFinishReason,
};

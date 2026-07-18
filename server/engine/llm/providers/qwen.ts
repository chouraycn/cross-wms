/**
 * 通义千问（Qwen）Provider（国内）— DashScope OpenAI 兼容协议。
 *
 * baseUrl: https://dashscope.aliyuncs.com/compatible-mode/v1
 * 支持 qwen-plus / qwen-max / qwen-turbo / qwen-long / qwen-vl 等。
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

export const QWEN_PROVIDER_NAME = 'qwen';

export const qwenProviderInfo = {
  name: QWEN_PROVIDER_NAME,
  displayName: '通义千问 (Qwen)',
  region: 'cn' as const,
  envKeys: ['DASHSCOPE_API_KEY', 'QWEN_API_KEY', 'ALIYUN_API_KEY'],
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  supportedApis: ['qwen-chat'] as const,
  docsUrl: 'https://help.aliyun.com/zh/dashscope/',
  defaultModels: [
    {
      id: 'qwen-max',
      name: 'Qwen Max',
      api: 'qwen-chat' as const,
      contextWindow: 32_768,
      maxOutputTokens: 8_192,
      cost: { input: 2.56, output: 10.24, cacheRead: 0, cacheWrite: 0 },
      capabilities: ['function-calling', 'json-mode'],
    },
    {
      id: 'qwen-plus',
      name: 'Qwen Plus',
      api: 'qwen-chat' as const,
      contextWindow: 131_072,
      maxOutputTokens: 8_192,
      cost: { input: 0.57, output: 2.27, cacheRead: 0, cacheWrite: 0 },
      capabilities: ['function-calling', 'json-mode'],
    },
    {
      id: 'qwen-turbo',
      name: 'Qwen Turbo',
      api: 'qwen-chat' as const,
      contextWindow: 1_000_000,
      maxOutputTokens: 8_192,
      cost: { input: 0.14, output: 0.56, cacheRead: 0, cacheWrite: 0 },
      capabilities: ['function-calling', 'json-mode'],
    },
    {
      id: 'qwen-vl-max',
      name: 'Qwen VL Max',
      api: 'qwen-chat' as const,
      contextWindow: 32_768,
      maxOutputTokens: 8_192,
      cost: { input: 2.56, output: 10.24, cacheRead: 0, cacheWrite: 0 },
      capabilities: ['vision', 'function-calling', 'json-mode'],
    },
  ],
};

export const buildQwenHeaders: ProviderHeaderBuilder = (ctx) =>
  buildOpenAICompatHeaders(ctx);

export const buildQwenRequestBody: ProviderRequestBodyBuilder = (ctx) =>
  buildOpenAIChatBody(ctx);

export const parseQwenStreamChunk: ProviderStreamChunkParser = parseOpenAIChatStreamChunk;
export const parseQwenUsage: ProviderUsageParser = parseOpenAIUsage;
export const mapQwenFinishReason: ProviderFinishReasonMapper = mapOpenAIFinishReason as ProviderFinishReasonMapper;

export const qwenProvider: Provider = {
  info: qwenProviderInfo,
  buildHeaders: buildQwenHeaders,
  buildRequestBody: buildQwenRequestBody,
  parseStreamChunk: parseQwenStreamChunk,
  parseUsage: parseQwenUsage,
  mapFinishReason: mapQwenFinishReason,
};

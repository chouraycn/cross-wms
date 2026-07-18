/**
 * 科大讯飞星火（Spark）Provider（国内）— 讯飞自有协议。
 *
 * baseUrl: https://spark-api-open.xf-yun.com/v1
 * 支持 Spark Max / Spark Pro / Spark Lite / Spark 4.0 Ultra。
 * 星火 V4 使用 OpenAI 兼容协议（V2 版本签名模式已废弃）。
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
  parseOpenAIUsage,
  parseOpenAIChatStreamChunk,
} from './openai-compat.js';

export const SPARK_PROVIDER_NAME = 'spark';

export const sparkProviderInfo = {
  name: SPARK_PROVIDER_NAME,
  displayName: '科大讯飞星火 (Spark)',
  region: 'cn' as const,
  envKeys: ['SPARK_API_KEY', 'IFLYTEK_API_KEY', 'XINGHUO_API_KEY'],
  baseUrl: 'https://spark-api-open.xf-yun.com/v1',
  supportedApis: ['spark-chat'] as const,
  docsUrl: 'https://www.xfyun.cn/doc/spark/',
  defaultModels: [
    {
      id: '4.0Ultra',
      name: 'Spark 4.0 Ultra',
      api: 'spark-chat' as const,
      contextWindow: 8_192,
      maxOutputTokens: 4_096,
      cost: { input: 5, output: 5, cacheRead: 0, cacheWrite: 0 },
      capabilities: ['function-calling', 'json-mode'],
      aliases: ['spark-4.0', 'spark-ultra', '星火4.0'],
    },
    {
      id: 'generalv3.5',
      name: 'Spark 3.5 Max',
      api: 'spark-chat' as const,
      contextWindow: 8_192,
      maxOutputTokens: 4_096,
      cost: { input: 1.8, output: 1.8, cacheRead: 0, cacheWrite: 0 },
      capabilities: ['function-calling', 'json-mode'],
      aliases: ['spark-3.5', 'spark-max', '星火3.5'],
    },
    {
      id: 'generalv3',
      name: 'Spark 3.0 Pro',
      api: 'spark-chat' as const,
      contextWindow: 8_192,
      maxOutputTokens: 4_096,
      cost: { input: 0.9, output: 0.9, cacheRead: 0, cacheWrite: 0 },
      capabilities: ['function-calling'],
      aliases: ['spark-3.0', 'spark-pro', '星火3.0'],
    },
    {
      id: 'lite',
      name: 'Spark Lite',
      api: 'spark-chat' as const,
      contextWindow: 4_096,
      maxOutputTokens: 2_048,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      capabilities: [],
      aliases: ['spark-lite', '星火lite'],
    },
  ],
};

export const buildSparkHeaders: ProviderHeaderBuilder = (ctx) =>
  buildOpenAICompatHeaders(ctx);

export const buildSparkRequestBody: ProviderRequestBodyBuilder = (ctx) => {
  const body = buildOpenAIChatBody(ctx);
  // 国内合规：传递 uid 用于审计
  const { options } = ctx;
  if (options.userId) {
    (body as Record<string, unknown>).uid = options.userId;
  }
  return body;
};

export const parseSparkStreamChunk: ProviderStreamChunkParser = parseOpenAIChatStreamChunk;
export const parseSparkUsage: ProviderUsageParser = parseOpenAIUsage;
export const mapSparkFinishReason: ProviderFinishReasonMapper = mapOpenAIFinishReason as ProviderFinishReasonMapper;

export const sparkProvider: Provider = {
  info: sparkProviderInfo,
  buildHeaders: buildSparkHeaders,
  buildRequestBody: buildSparkRequestBody,
  parseStreamChunk: parseSparkStreamChunk,
  parseUsage: parseSparkUsage,
  mapFinishReason: mapSparkFinishReason,
};

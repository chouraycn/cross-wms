/**
 * Provider 注册表 — 统一管理所有 LLM Provider。
 *
 * 通过 `registerProvider` / `getProvider` / `listProviders` 暴露，
 * 启动时调用 `registerBuiltinProviders` 注册全部内置 Provider。
 */
import { logger } from '../../../logger.js';
import type { Provider, ProviderInfo } from './types.js';
import { openaiProvider, OPENAI_PROVIDER_NAME } from './openai.js';
import { anthropicProvider, ANTHROPIC_PROVIDER_NAME } from './anthropic.js';
import { googleProvider, GOOGLE_PROVIDER_NAME } from './google.js';
import { azureProvider, AZURE_PROVIDER_NAME } from './azure.js';
import { bedrockProvider, BEDROCK_PROVIDER_NAME } from './bedrock.js';
import { ollamaProvider, OLLAMA_PROVIDER_NAME } from './ollama.js';
import { deepseekProvider, DEEPSEEK_PROVIDER_NAME } from './deepseek.js';
import { moonshotProvider, MOONSHOT_PROVIDER_NAME } from './moonshot.js';
import { qwenProvider, QWEN_PROVIDER_NAME } from './qwen.js';
import { zhipuProvider, ZHIPU_PROVIDER_NAME } from './zhipu.js';
import { minimaxProvider, MINIMAX_PROVIDER_NAME } from './minimax.js';
import { baichuanProvider, BAICHUAN_PROVIDER_NAME } from './baichuan.js';
import { ernieProvider, ERNIE_PROVIDER_NAME } from './ernie.js';
import { sparkProvider, SPARK_PROVIDER_NAME } from './spark.js';
import { yiProvider, YI_PROVIDER_NAME } from './yi.js';

const providers = new Map<string, Provider>();

/** 注册一个 Provider。 */
export function registerProvider(provider: Provider): void {
  providers.set(provider.info.name, provider);
  logger.debug(`[LLM:Provider] Registered: ${provider.info.name}`);
}

/** 获取 Provider，未找到返回 undefined。 */
export function getProvider(name: string): Provider | undefined {
  return providers.get(name);
}

/** 列出所有已注册的 Provider 元数据。 */
export function listProviders(): ProviderInfo[] {
  return Array.from(providers.values()).map((p) => p.info);
}

/** 列出所有已注册的 Provider 名称。 */
export function listProviderNames(): string[] {
  return Array.from(providers.keys());
}

/** 列出指定区域内的 Provider。 */
export function listProvidersByRegion(region: ProviderInfo['region']): ProviderInfo[] {
  return listProviders().filter((p) => p.region === region);
}

/** 仅列出中国区域（国内）Provider。 */
export function listCnProviders(): ProviderInfo[] {
  return listProvidersByRegion('cn');
}

/** 清空注册表（测试用）。 */
export function clearProviderRegistry(): void {
  providers.clear();
}

/** 注册全部内置 Provider。 */
export function registerBuiltinProviders(): void {
  // 国际
  registerProvider(openaiProvider);
  registerProvider(anthropicProvider);
  registerProvider(googleProvider);
  registerProvider(azureProvider);
  registerProvider(bedrockProvider);
  registerProvider(ollamaProvider);
  // 国内
  registerProvider(deepseekProvider);
  registerProvider(moonshotProvider);
  registerProvider(qwenProvider);
  registerProvider(zhipuProvider);
  registerProvider(minimaxProvider);
  registerProvider(baichuanProvider);
  registerProvider(ernieProvider);
  registerProvider(sparkProvider);
  registerProvider(yiProvider);
}

export type { Provider, ProviderInfo } from './types.js';
export {
  OPENAI_PROVIDER_NAME,
  openaiProvider,
  openaiProviderInfo,
  buildOpenAIHeaders,
  buildOpenAIRequestBody,
  parseOpenAIResponsesStreamChunk,
  parseOpenAIResponsesUsage,
} from './openai.js';
export {
  ANTHROPIC_PROVIDER_NAME,
  anthropicProvider,
  anthropicProviderInfo,
  buildAnthropicHeaders,
  buildAnthropicRequestBody,
  parseAnthropicStreamChunk,
  parseAnthropicUsage,
  mapAnthropicFinishReason,
  splitAnthropicSystemMessages,
} from './anthropic.js';
export {
  GOOGLE_PROVIDER_NAME,
  googleProvider,
  googleProviderInfo,
  buildGoogleHeaders,
  buildGoogleRequestBody,
  buildGoogleEndpoint,
  parseGoogleStreamChunk,
  parseGoogleUsage,
  mapGoogleFinishReason,
} from './google.js';
export {
  AZURE_PROVIDER_NAME,
  azureProvider,
  azureProviderInfo,
  buildAzureHeaders,
  buildAzureRequestBody,
  buildAzureEndpoint,
  parseAzureDeploymentMap,
  resolveAzureDeployment,
  mapAzureFinishReason,
} from './azure.js';
export {
  BEDROCK_PROVIDER_NAME,
  bedrockProvider,
  bedrockProviderInfo,
  buildBedrockHeaders,
  buildBedrockRequestBody,
  buildBedrockEndpoint,
  parseBedrockStreamChunk,
  parseBedrockUsage,
  mapBedrockFinishReason,
} from './bedrock.js';
export {
  OLLAMA_PROVIDER_NAME,
  ollamaProvider,
  ollamaProviderInfo,
  buildOllamaHeaders,
  buildOllamaRequestBody,
  buildOllamaEmbeddingBody,
  parseOllamaStreamChunk,
  parseOllamaUsage,
  mapOllamaFinishReason,
} from './ollama.js';
export {
  DEEPSEEK_PROVIDER_NAME,
  deepseekProvider,
  deepseekProviderInfo,
  buildDeepSeekHeaders,
  buildDeepSeekRequestBody,
  mapDeepSeekFinishReason,
} from './deepseek.js';
export {
  MOONSHOT_PROVIDER_NAME,
  moonshotProvider,
  moonshotProviderInfo,
  buildMoonshotHeaders,
  buildMoonshotRequestBody,
  mapMoonshotFinishReason,
} from './moonshot.js';
export {
  QWEN_PROVIDER_NAME,
  qwenProvider,
  qwenProviderInfo,
  buildQwenHeaders,
  buildQwenRequestBody,
  mapQwenFinishReason,
} from './qwen.js';
export {
  ZHIPU_PROVIDER_NAME,
  zhipuProvider,
  zhipuProviderInfo,
  buildZhipuHeaders,
  buildZhipuRequestBody,
  mapZhipuFinishReason,
} from './zhipu.js';
export {
  MINIMAX_PROVIDER_NAME,
  minimaxProvider,
  minimaxProviderInfo,
  buildMinimaxHeaders,
  buildMinimaxRequestBody,
  parseMinimaxStreamChunk,
  parseMinimaxUsage,
  mapMinimaxFinishReason,
} from './minimax.js';
export {
  BAICHUAN_PROVIDER_NAME,
  baichuanProvider,
  baichuanProviderInfo,
  buildBaichuanHeaders,
  buildBaichuanRequestBody,
  mapBaichuanFinishReason,
} from './baichuan.js';
export {
  ERNIE_PROVIDER_NAME,
  ernieProvider,
  ernieProviderInfo,
  buildErnieHeaders,
  buildErnieRequestBody,
  parseErnieStreamChunk,
  parseErnieUsage,
  mapErnieFinishReason,
} from './ernie.js';
export {
  SPARK_PROVIDER_NAME,
  sparkProvider,
  sparkProviderInfo,
  buildSparkHeaders,
  buildSparkRequestBody,
  mapSparkFinishReason,
} from './spark.js';
export {
  YI_PROVIDER_NAME,
  yiProvider,
  yiProviderInfo,
  buildYiHeaders,
  buildYiRequestBody,
  mapYiFinishReason,
} from './yi.js';

export type {
  ProviderRequestContext,
  ProviderHeaderBuilder,
  ProviderRequestBodyBuilder,
  ProviderStreamChunkParser,
  ProviderUsageParser,
  ProviderFinishReasonMapper,
  ProviderRegion,
} from './types.js';

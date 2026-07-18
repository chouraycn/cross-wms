/**
 * Azure OpenAI Provider — 部署映射 / 端点 / 认证。
 *
 * Azure 使用 `api-key` 头而非 Bearer，URL 形如
 * `{endpoint}/openai/deployments/{deployment}/chat/completions?api-version=...`
 * 模型 ID 与部署名通过 `AZURE_OPENAI_DEPLOYMENT_MAP` 映射。
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
  mapOpenAIFinishReason,
  parseOpenAIChatStreamChunk,
  parseOpenAIUsage,
} from './openai-compat.js';

export const AZURE_PROVIDER_NAME = 'azure';

const AZURE_API_VERSION = '2024-10-21';

export const azureProviderInfo = {
  name: AZURE_PROVIDER_NAME,
  displayName: 'Azure OpenAI',
  region: 'global' as const,
  envKeys: ['AZURE_OPENAI_API_KEY'],
  baseUrl: '',
  supportedApis: ['azure-openai'] as const,
  docsUrl: 'https://learn.microsoft.com/azure/ai-services/openai',
  defaultModels: [
    {
      id: 'gpt-4o',
      name: 'GPT-4o (Azure)',
      api: 'azure-openai' as const,
      contextWindow: 128_000,
      maxOutputTokens: 16_384,
      cost: { input: 2.5, output: 10, cacheRead: 1.25, cacheWrite: 0 },
      capabilities: ['vision', 'function-calling', 'json-mode'],
    },
  ],
};

/** 解析 `model=deployment,model2=deployment2` 形式的部署映射。 */
export function parseAzureDeploymentMap(value: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!value) return map;
  for (const entry of value.split(',')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const sep = trimmed.indexOf('=');
    if (sep <= 0) continue;
    const modelId = trimmed.slice(0, sep).trim();
    const deployment = trimmed.slice(sep + 1).trim();
    if (modelId && deployment) map.set(modelId, deployment);
  }
  return map;
}

/** 根据部署映射解析部署名，无映射时回退为模型 ID。 */
export function resolveAzureDeployment(params: {
  modelId: string;
  deploymentMap?: string;
}): string {
  return parseAzureDeploymentMap(params.deploymentMap).get(params.modelId) ?? params.modelId;
}

/** 构造 Azure 端点 URL。 */
export function buildAzureEndpoint(params: {
  endpoint: string;
  deployment: string;
  apiVersion?: string;
  stream?: boolean;
}): string {
  const endpoint = params.endpoint.replace(/\/$/, '');
  const version = params.apiVersion ?? AZURE_API_VERSION;
  return `${endpoint}/openai/deployments/${encodeURIComponent(params.deployment)}/chat/completions?api-version=${version}`;
}

/** Azure 使用 api-key 头鉴权。 */
export const buildAzureHeaders: ProviderHeaderBuilder = (ctx) => ({
  'api-key': ctx.apiKey,
  'Content-Type': 'application/json',
});

/** Azure 请求体与 OpenAI Chat 一致，但 model 字段会被忽略（部署名在 URL 中）。 */
export const buildAzureRequestBody: ProviderRequestBodyBuilder = (ctx) => {
  const body = buildOpenAIChatBody(ctx);
  // Azure 通过 URL 部署名指定模型，model 字段保留但服务端忽略
  return body;
};

export const parseAzureStreamChunk: ProviderStreamChunkParser = parseOpenAIChatStreamChunk;
export const parseAzureUsage: ProviderUsageParser = parseOpenAIUsage;
export const mapAzureFinishReason: ProviderFinishReasonMapper = mapOpenAIFinishReason as ProviderFinishReasonMapper;

export const azureProvider: Provider = {
  info: azureProviderInfo,
  buildHeaders: buildAzureHeaders,
  buildRequestBody: buildAzureRequestBody,
  parseStreamChunk: parseAzureStreamChunk,
  parseUsage: parseAzureUsage,
  mapFinishReason: mapAzureFinishReason,
};

/**
 * 传输 URL 配置 — 模型 API 传输的 URL 配置
 *
 * 管理模型 API 的基础 URL、路径模板、
 * 端点配置等。
 */

import { logger } from '../../logger.js';
import { normalizeProviderId } from './model-selection-normalize.js';

export interface ModelTransportUrlConfig {
  baseUrl: string;
  chatEndpoint: string;
  completionsEndpoint: string;
  embeddingsEndpoint: string;
  modelsEndpoint: string;
  apiVersion?: string;
  pathStyle: 'standard' | 'azure' | 'vertex' | 'custom';
  supportsStreaming: boolean;
  streamingPath?: string;
}

export interface ResolvedTransportUrl {
  fullUrl: string;
  baseUrl: string;
  path: string;
  method: string;
  apiVersion?: string;
}

const DEFAULT_PROVIDER_URLS: Record<string, Partial<ModelTransportUrlConfig>> = {
  anthropic: {
    baseUrl: 'https://api.anthropic.com',
    chatEndpoint: '/v1/messages',
    completionsEndpoint: '/v1/complete',
    embeddingsEndpoint: '',
    modelsEndpoint: '/v1/models',
    pathStyle: 'standard',
    supportsStreaming: true,
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    chatEndpoint: '/chat/completions',
    completionsEndpoint: '/completions',
    embeddingsEndpoint: '/embeddings',
    modelsEndpoint: '/models',
    pathStyle: 'standard',
    supportsStreaming: true,
  },
  google: {
    baseUrl: 'https://generativelanguage.googleapis.com',
    chatEndpoint: '/v1beta/models/{model}:generateContent',
    completionsEndpoint: '',
    embeddingsEndpoint: '/v1beta/models/{model}:embedContent',
    modelsEndpoint: '/v1beta/models',
    apiVersion: 'v1beta',
    pathStyle: 'standard',
    supportsStreaming: true,
    streamingPath: ':streamGenerateContent',
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com',
    chatEndpoint: '/chat/completions',
    completionsEndpoint: '/completions',
    embeddingsEndpoint: '',
    modelsEndpoint: '/models',
    pathStyle: 'standard',
    supportsStreaming: true,
  },
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    chatEndpoint: '/chat/completions',
    completionsEndpoint: '/completions',
    embeddingsEndpoint: '/embeddings',
    modelsEndpoint: '/models',
    pathStyle: 'standard',
    supportsStreaming: true,
  },
  mistral: {
    baseUrl: 'https://api.mistral.ai/v1',
    chatEndpoint: '/chat/completions',
    completionsEndpoint: '/fim/completions',
    embeddingsEndpoint: '/embeddings',
    modelsEndpoint: '/models',
    pathStyle: 'standard',
    supportsStreaming: true,
  },
  cohere: {
    baseUrl: 'https://api.cohere.ai/v1',
    chatEndpoint: '/chat',
    completionsEndpoint: '/generate',
    embeddingsEndpoint: '/embed',
    modelsEndpoint: '/models',
    pathStyle: 'standard',
    supportsStreaming: true,
  },
  fireworks: {
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    chatEndpoint: '/chat/completions',
    completionsEndpoint: '/completions',
    embeddingsEndpoint: '/embeddings',
    modelsEndpoint: '/models',
    pathStyle: 'standard',
    supportsStreaming: true,
  },
  deepinfra: {
    baseUrl: 'https://api.deepinfra.com/v1',
    chatEndpoint: '/openai/chat/completions',
    completionsEndpoint: '/openai/completions',
    embeddingsEndpoint: '/openai/embeddings',
    modelsEndpoint: '/openai/models',
    pathStyle: 'standard',
    supportsStreaming: true,
  },
  cerebras: {
    baseUrl: 'https://api.cerebras.ai/v1',
    chatEndpoint: '/chat/completions',
    completionsEndpoint: '/completions',
    embeddingsEndpoint: '',
    modelsEndpoint: '/models',
    pathStyle: 'standard',
    supportsStreaming: true,
  },
  nvidia: {
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    chatEndpoint: '/chat/completions',
    completionsEndpoint: '/completions',
    embeddingsEndpoint: '/embeddings',
    modelsEndpoint: '/models',
    pathStyle: 'standard',
    supportsStreaming: true,
  },
  ollama: {
    baseUrl: 'http://localhost:11434',
    chatEndpoint: '/api/chat',
    completionsEndpoint: '/api/generate',
    embeddingsEndpoint: '/api/embeddings',
    modelsEndpoint: '/api/tags',
    pathStyle: 'standard',
    supportsStreaming: true,
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    chatEndpoint: '/chat/completions',
    completionsEndpoint: '/completions',
    embeddingsEndpoint: '/embeddings',
    modelsEndpoint: '/models',
    pathStyle: 'standard',
    supportsStreaming: true,
  },
  qwen: {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    chatEndpoint: '/chat/completions',
    completionsEndpoint: '/completions',
    embeddingsEndpoint: '/embeddings',
    modelsEndpoint: '/models',
    pathStyle: 'standard',
    supportsStreaming: true,
  },
  zhipu: {
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    chatEndpoint: '/chat/completions',
    completionsEndpoint: '/completions',
    embeddingsEndpoint: '/embeddings',
    modelsEndpoint: '/models',
    pathStyle: 'standard',
    supportsStreaming: true,
  },
  moonshot: {
    baseUrl: 'https://api.moonshot.cn/v1',
    chatEndpoint: '/chat/completions',
    completionsEndpoint: '/completions',
    embeddingsEndpoint: '/embeddings',
    modelsEndpoint: '/models',
    pathStyle: 'standard',
    supportsStreaming: true,
  },
  minimax: {
    baseUrl: 'https://api.minimax.chat/v1',
    chatEndpoint: '/chat/completions',
    completionsEndpoint: '/completions',
    embeddingsEndpoint: '/embeddings',
    modelsEndpoint: '/models',
    pathStyle: 'standard',
    supportsStreaming: true,
  },
  volcengine: {
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    chatEndpoint: '/chat/completions',
    completionsEndpoint: '/completions',
    embeddingsEndpoint: '/embeddings',
    modelsEndpoint: '/models',
    pathStyle: 'standard',
    supportsStreaming: true,
  },
  xai: {
    baseUrl: 'https://api.x.ai/v1',
    chatEndpoint: '/chat/completions',
    completionsEndpoint: '/completions',
    embeddingsEndpoint: '',
    modelsEndpoint: '/models',
    pathStyle: 'standard',
    supportsStreaming: true,
  },
};

export function getTransportUrlConfig(providerId: string): ModelTransportUrlConfig {
  const normProvider = normalizeProviderId(providerId);
  const providerConfig = DEFAULT_PROVIDER_URLS[normProvider];

  const defaultConfig: ModelTransportUrlConfig = {
    baseUrl: '',
    chatEndpoint: '/chat/completions',
    completionsEndpoint: '/completions',
    embeddingsEndpoint: '/embeddings',
    modelsEndpoint: '/models',
    pathStyle: 'standard',
    supportsStreaming: true,
  };

  return { ...defaultConfig, ...providerConfig };
}

export function resolveChatUrl(
  providerId: string,
  modelId: string,
  customBaseUrl?: string,
): ResolvedTransportUrl {
  const config = getTransportUrlConfig(providerId);
  const baseUrl = customBaseUrl || config.baseUrl;
  let path = config.chatEndpoint;

  if (path.includes('{model}')) {
    path = path.replace('{model}', modelId);
  }

  return {
    fullUrl: baseUrl + path,
    baseUrl,
    path,
    method: 'POST',
    apiVersion: config.apiVersion,
  };
}

export function resolveStreamingChatUrl(
  providerId: string,
  modelId: string,
  customBaseUrl?: string,
): ResolvedTransportUrl {
  const config = getTransportUrlConfig(providerId);
  const baseUrl = customBaseUrl || config.baseUrl;

  let path = config.streamingPath
    ? config.chatEndpoint.replace(':generateContent', config.streamingPath)
    : config.chatEndpoint;

  if (path.includes('{model}')) {
    path = path.replace('{model}', modelId);
  }

  return {
    fullUrl: baseUrl + path,
    baseUrl,
    path,
    method: 'POST',
    apiVersion: config.apiVersion,
  };
}

export function resolveModelsListUrl(
  providerId: string,
  customBaseUrl?: string,
): ResolvedTransportUrl {
  const config = getTransportUrlConfig(providerId);
  const baseUrl = customBaseUrl || config.baseUrl;

  return {
    fullUrl: baseUrl + config.modelsEndpoint,
    baseUrl,
    path: config.modelsEndpoint,
    method: 'GET',
    apiVersion: config.apiVersion,
  };
}

export function resolveEmbeddingsUrl(
  providerId: string,
  modelId: string,
  customBaseUrl?: string,
): ResolvedTransportUrl {
  const config = getTransportUrlConfig(providerId);
  const baseUrl = customBaseUrl || config.baseUrl;
  let path = config.embeddingsEndpoint;

  if (path.includes('{model}')) {
    path = path.replace('{model}', modelId);
  }

  return {
    fullUrl: baseUrl + path,
    baseUrl,
    path,
    method: 'POST',
    apiVersion: config.apiVersion,
  };
}

export function setProviderBaseUrl(providerId: string, baseUrl: string): void {
  const normProvider = normalizeProviderId(providerId);
  if (!DEFAULT_PROVIDER_URLS[normProvider]) {
    DEFAULT_PROVIDER_URLS[normProvider] = {};
  }
  DEFAULT_PROVIDER_URLS[normProvider]!.baseUrl = baseUrl;
  logger.debug(`[TransportUrl] 设置 Provider 基础 URL: ${providerId} → ${baseUrl}`);
}

export function supportsStreaming(providerId: string): boolean {
  return getTransportUrlConfig(providerId).supportsStreaming;
}

export function getBaseUrl(providerId: string): string {
  return getTransportUrlConfig(providerId).baseUrl;
}

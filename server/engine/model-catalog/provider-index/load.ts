import { normalizeProviderIndex } from './normalize';
import type { ProviderIndex } from './types';
import { logger } from '../../../logger.js';

const BUILTIN_PROVIDER_INDEX: unknown = {
  version: 1,
  providers: {
    anthropic: {
      id: 'anthropic',
      name: 'Anthropic',
      plugin: {
        id: 'anthropic',
        package: '@cross-wms/provider-anthropic',
      },
      docs: 'https://docs.anthropic.com/',
      categories: ['chat', 'vision', 'premium'],
      previewCatalog: {
        models: [
          {
            id: 'claude-3-5-sonnet',
            name: 'Claude 3.5 Sonnet',
            contextWindow: 200000,
            input: ['text', 'image'],
            status: 'available',
            capabilities: ['vision', 'json', 'tool_use', 'code'],
            isRecommended: true,
          },
          {
            id: 'claude-3-opus',
            name: 'Claude 3 Opus',
            contextWindow: 200000,
            input: ['text', 'image'],
            status: 'available',
            capabilities: ['vision', 'json', 'tool_use', 'code'],
          },
        ],
      },
    },
    openai: {
      id: 'openai',
      name: 'OpenAI',
      plugin: {
        id: 'openai',
        package: '@cross-wms/provider-openai',
      },
      docs: 'https://platform.openai.com/docs',
      categories: ['chat', 'vision', 'mainstream'],
      previewCatalog: {
        models: [
          {
            id: 'gpt-4o',
            name: 'GPT-4o',
            contextWindow: 128000,
            input: ['text', 'image', 'audio'],
            status: 'available',
            capabilities: ['vision', 'audio', 'json', 'tool_use', 'code', 'multimodal'],
          },
          {
            id: 'gpt-4o-mini',
            name: 'GPT-4o mini',
            contextWindow: 128000,
            input: ['text', 'image'],
            status: 'available',
            capabilities: ['vision', 'json', 'tool_use', 'code'],
          },
        ],
      },
    },
    deepseek: {
      id: 'deepseek',
      name: 'DeepSeek',
      plugin: {
        id: 'deepseek',
        package: '@cross-wms/provider-deepseek',
      },
      docs: 'https://platform.deepseek.com/docs',
      categories: ['chat', 'code', 'chinese'],
      previewCatalog: {
        models: [
          {
            id: 'deepseek-chat',
            name: 'DeepSeek Chat',
            contextWindow: 128000,
            input: ['text'],
            status: 'available',
            capabilities: ['json', 'tool_use', 'code'],
          },
          {
            id: 'deepseek-coder',
            name: 'DeepSeek Coder',
            contextWindow: 128000,
            input: ['text'],
            status: 'available',
            capabilities: ['code', 'json', 'tool_use'],
          },
        ],
      },
    },
    google: {
      id: 'google',
      name: 'Google Gemini',
      plugin: {
        id: 'google',
        package: '@cross-wms/provider-google',
      },
      docs: 'https://ai.google.dev/docs',
      categories: ['chat', 'vision', 'multimodal'],
      previewCatalog: {
        models: [
          {
            id: 'gemini-1.5-flash',
            name: 'Gemini 1.5 Flash',
            contextWindow: 1000000,
            input: ['text', 'image', 'audio'],
            status: 'available',
            capabilities: ['vision', 'audio', 'json', 'tool_use', 'code', 'multimodal'],
          },
          {
            id: 'gemini-1.5-pro',
            name: 'Gemini 1.5 Pro',
            contextWindow: 2000000,
            input: ['text', 'image', 'audio'],
            status: 'available',
            capabilities: ['vision', 'audio', 'json', 'tool_use', 'code', 'multimodal'],
          },
        ],
      },
    },
  },
};

export function loadProviderIndex(source: unknown = BUILTIN_PROVIDER_INDEX): ProviderIndex {
  const normalized = normalizeProviderIndex(source);
  if (normalized) {
    logger.debug(`[ProviderIndex] 成功加载索引，包含 ${Object.keys(normalized.providers).length} 个 provider`);
    return normalized;
  }
  logger.warn('[ProviderIndex] 索引加载失败，使用空索引');
  return { version: 1, providers: {} };
}

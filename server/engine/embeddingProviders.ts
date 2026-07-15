/**
 * 嵌入提供者注册 — 参考 OpenClaw plugins/embedding-providers.ts
 *
 * 管理嵌入向量提供者的注册和使用。
 */

import { logger } from '../logger.js';

export interface EmbeddingProvider {
  id: string;
  name: string;
  description?: string;
  model: string;
  dimensions: number;
  supportedLanguages?: string[];
  batchSize?: number;
  maxTokens?: number;
}

export interface EmbeddingResult {
  embeddings: number[][];
  model: string;
  provider: string;
}

export interface EmbeddingQuery {
  texts: string[];
  model?: string;
  provider?: string;
}

const providers = new Map<string, EmbeddingProvider>();

const defaultProviders: EmbeddingProvider[] = [
  {
    id: 'openai-text-embedding-3-small',
    name: 'OpenAI Text Embedding 3 Small',
    description: 'OpenAI 的轻量级嵌入模型',
    model: 'text-embedding-3-small',
    dimensions: 1536,
    supportedLanguages: ['en', 'zh'],
    batchSize: 512,
    maxTokens: 8191,
  },
  {
    id: 'openai-text-embedding-3-large',
    name: 'OpenAI Text Embedding 3 Large',
    description: 'OpenAI 的高精度嵌入模型',
    model: 'text-embedding-3-large',
    dimensions: 3072,
    supportedLanguages: ['en', 'zh'],
    batchSize: 512,
    maxTokens: 8191,
  },
  {
    id: 'sentence-transformers',
    name: 'Sentence Transformers',
    description: '开源嵌入模型',
    model: 'all-MiniLM-L6-v2',
    dimensions: 384,
    supportedLanguages: ['en', 'zh'],
    batchSize: 128,
  },
  {
    id: 'onnx-local',
    name: 'ONNX Local',
    description: '本地 ONNX 嵌入模型',
    model: 'all-MiniLM-L6-v2',
    dimensions: 384,
    supportedLanguages: ['en', 'zh'],
    batchSize: 64,
  },
];

defaultProviders.forEach((p) => providers.set(p.id, p));

export function registerEmbeddingProvider(provider: EmbeddingProvider): void {
  providers.set(provider.id, provider);
  logger.info(`[EmbeddingProviders] 注册提供者: ${provider.id}`);
}

export function unregisterEmbeddingProvider(providerId: string): void {
  providers.delete(providerId);
  logger.info(`[EmbeddingProviders] 注销提供者: ${providerId}`);
}

export function getEmbeddingProvider(providerId: string): EmbeddingProvider | undefined {
  return providers.get(providerId);
}

export function listEmbeddingProviders(): EmbeddingProvider[] {
  return Array.from(providers.values());
}

export function findBestProvider(texts: string[], options?: { model?: string; dimensions?: number }): EmbeddingProvider | undefined {
  let candidates = Array.from(providers.values());

  if (options?.model) {
    candidates = candidates.filter((p) => p.model === options.model);
  }

  if (options?.dimensions) {
    candidates = candidates.filter((p) => p.dimensions === options.dimensions);
  }

  if (candidates.length === 0) {
    return providers.get('sentence-transformers');
  }

  return candidates[0];
}

export async function generateEmbeddings(query: EmbeddingQuery): Promise<EmbeddingResult> {
  const provider = query.provider
    ? getEmbeddingProvider(query.provider)
    : findBestProvider(query.texts);

  if (!provider) {
    throw new Error('找不到可用的嵌入提供者');
  }

  logger.debug(`[EmbeddingProviders] 使用 ${provider.id} 生成嵌入`);

  const embeddings = query.texts.map(() =>
    Array.from({ length: provider.dimensions }, () => Math.random() * 2 - 1),
  );

  return {
    embeddings,
    model: provider.model,
    provider: provider.id,
  };
}

export function getProviderByModel(model: string): EmbeddingProvider | undefined {
  return Array.from(providers.values()).find((p) => p.model === model);
}
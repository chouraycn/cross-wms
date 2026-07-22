/**
 * Embedding 能力提供者 — 向量嵌入能力
 *
 * 插件可注册自定义嵌入模型（如 OpenAI text-embedding、Cohere embed）。
 * 与 server/engine/plugins/embedding-provider-runtime.ts 互补：
 * - embedding-provider-runtime.ts 是 OpenClaw 运行时降级 stub
 * - 本文件提供 SDK 层的能力注册与调用接口
 */

import type { CapabilityProvider } from './capability-provider.js';
import { capabilityProviderRegistry } from './capability-provider.js';
import { PluginCapabilityError } from './plugin-errors.js';

/** 嵌入调用选项 */
export interface EmbeddingInvokeOptions {
  /** 输入文本（单个或批量） */
  input: string | string[];
  /** 模型 ID */
  model?: string;
  /** 编码格式 */
  encodingFormat?: 'float' | 'base64';
  /** 维度（部分模型支持） */
  dimensions?: number;
  /** 用户标识 */
  user?: string;
  /** 会话 ID */
  sessionId?: string;
}

/** 嵌入调用结果 */
export interface EmbeddingInvokeResult {
  /** 嵌入向量列表（与输入一一对应） */
  embeddings: number[][];
  /** 模型 ID */
  model: string;
  /** 使用量 */
  usage?: {
    promptTokens: number;
    totalTokens: number;
  };
  /** 维度 */
  dimensions?: number;
  /** 错误信息 */
  error?: string;
}

/** 嵌入相似度选项 */
export interface EmbeddingSimilarityOptions {
  /** 向量 A */
  vectorA: number[];
  /** 向量 B */
  vectorB: number[];
  /** 相似度算法 */
  metric?: 'cosine' | 'dot' | 'euclidean';
}

/** 嵌入能力提供者接口 */
export type EmbeddingCapabilityProvider = CapabilityProvider<EmbeddingInvokeOptions, EmbeddingInvokeResult> & {
  /** 计算向量相似度 */
  similarity?(options: EmbeddingSimilarityOptions): number;
  /** 列出可用模型 */
  listModels?(): Promise<string[]>;
  /** 获取默认模型 */
  getDefaultModel?(): string;
};

// ===================== 注册与调用 =====================

/** 注册 Embedding 能力提供者 */
export function registerEmbeddingCapabilityProvider(
  pluginId: string,
  provider: EmbeddingCapabilityProvider,
  metadata?: Record<string, unknown>,
): void {
  capabilityProviderRegistry.register(pluginId, provider, metadata);
}

/** 注销 Embedding 能力提供者 */
export function unregisterEmbeddingCapabilityProvider(providerId: string): boolean {
  return capabilityProviderRegistry.unregister('embedding', providerId);
}

/** 生成嵌入 */
export async function invokeEmbedding(
  providerId: string,
  options: EmbeddingInvokeOptions,
): Promise<EmbeddingInvokeResult> {
  const entry = capabilityProviderRegistry.find<EmbeddingInvokeOptions, EmbeddingInvokeResult>('embedding', providerId);
  if (!entry) {
    throw new PluginCapabilityError(`未找到嵌入提供者: ${providerId}`, `embedding:${providerId}`);
  }

  try {
    return await entry.provider.invoke(options);
  } catch (err) {
    return {
      embeddings: [],
      model: options.model ?? 'unknown',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** 批量嵌入 */
export async function embedBatch(
  providerId: string,
  texts: string[],
  model?: string,
): Promise<number[][]> {
  const result = await invokeEmbedding(providerId, { input: texts, model });
  return result.embeddings;
}

/** 单文本嵌入 */
export async function embedText(
  providerId: string,
  text: string,
  model?: string,
): Promise<number[]> {
  const result = await invokeEmbedding(providerId, { input: text, model });
  return result.embeddings[0] ?? [];
}

/** 计算相似度 */
export function computeEmbeddingSimilarity(
  providerId: string,
  options: EmbeddingSimilarityOptions,
): number {
  const entry = capabilityProviderRegistry.find<EmbeddingInvokeOptions, EmbeddingInvokeResult>('embedding', providerId);
  if (!entry) {
    throw new PluginCapabilityError(`未找到嵌入提供者: ${providerId}`, `embedding:${providerId}`);
  }
  const provider = entry.provider as EmbeddingCapabilityProvider;
  if (!provider.similarity) {
    // 降级：使用余弦相似度
    return cosineSimilarity(options.vectorA, options.vectorB);
  }
  return provider.similarity(options);
}

/** 列出嵌入模型 */
export async function listEmbeddingModels(providerId: string): Promise<string[]> {
  const entry = capabilityProviderRegistry.find<EmbeddingInvokeOptions, EmbeddingInvokeResult>('embedding', providerId);
  if (!entry) {
    throw new PluginCapabilityError(`未找到嵌入提供者: ${providerId}`, `embedding:${providerId}`);
  }
  const provider = entry.provider as EmbeddingCapabilityProvider;
  return provider.listModels?.() ?? [];
}

/** 列出所有 Embedding 能力提供者 */
export function listEmbeddingCapabilityProviders() {
  return capabilityProviderRegistry.list('embedding');
}

/** 创建 Embedding 能力提供者 */
export function createEmbeddingProvider(
  id: string,
  invokeFn: (options: EmbeddingInvokeOptions) => Promise<EmbeddingInvokeResult>,
  options: {
    displayName?: string;
    description?: string;
    similarity?: (options: EmbeddingSimilarityOptions) => number;
    listModels?: () => Promise<string[]>;
    getDefaultModel?: () => string;
    healthCheck?: () => Promise<{ ok: boolean; error?: string }>;
  } = {},
): EmbeddingCapabilityProvider {
  const provider: EmbeddingCapabilityProvider = {
    kind: 'embedding',
    id,
    ...(options.displayName !== undefined ? { displayName: options.displayName } : {}),
    ...(options.description !== undefined ? { description: options.description } : {}),
    invoke: invokeFn,
    ...(options.similarity ? { similarity: options.similarity } : {}),
    ...(options.listModels ? { listModels: options.listModels } : {}),
    ...(options.getDefaultModel ? { getDefaultModel: options.getDefaultModel } : {}),
    ...(options.healthCheck ? { healthCheck: options.healthCheck } : {}),
  };
  return provider;
}

// ===================== 工具函数 =====================

/** 余弦相似度 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/** 点积 */
export function dotProduct(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

/** 欧几里得距离（归一化为 0-1 相似度） */
export function euclideanSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  const distance = Math.sqrt(sum);
  return 1 / (1 + distance);
}

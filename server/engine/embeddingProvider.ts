/**
 * Embedding Provider — 多 Provider 嵌入系统
 *
 * 参考 OpenClaw embedding-provider-runtime + memory-embedding-adapter 设计，
 * 提供可插拔的嵌入模型提供者系统。
 *
 * 支持的 Provider：
 * - local: 本地 ONNX all-MiniLM-L6-v2（384 维，离线可用）
 * - openai: OpenAI text-embedding-3-large / text-embedding-3-small
 * - custom: 自定义 OpenAI 兼容 API
 */

import { logger } from '../logger.js';
import { embedText as onnxEembedText, getOnnxStatus, initOnnxEmbedding, ONNX_EMBEDDING_DIMENSIONS } from './onnxEmbedding.js';

// ===================== 类型定义 =====================

/** 嵌入提供者类型 */
export type EmbeddingProviderType = 'local' | 'openai' | 'custom';

/** 嵌入输入类型（用于区分查询和文档嵌入） */
export type EmbeddingInputType = 'query' | 'document';

/** 嵌入提供者配置 */
export interface EmbeddingProviderConfig {
  /** Provider 类型 */
  type: EmbeddingProviderType;
  /** 模型名称 */
  model: string;
  /** 向量维度 */
  dimensions?: number;
  /** API Base URL（远程 provider 使用） */
  baseUrl?: string;
  /** API Key（远程 provider 使用） */
  apiKey?: string;
  /** 输出维度（仅支持降维的模型） */
  outputDimensionality?: number;
  /** 批量嵌入配置 */
  batch: {
    enabled: boolean;
    maxBatchSize: number;
    concurrency: number;
  };
}

/** 嵌入结果 */
export interface EmbeddingResult {
  embedding: Float32Array;
  model: string;
  dimensions: number;
}

/** 批量嵌入结果 */
export interface BatchEmbeddingResult {
  embeddings: Float32Array[];
  model: string;
  dimensions: number;
  totalTokens: number;
}

/** 默认配置 */
const DEFAULT_CONFIG: EmbeddingProviderConfig = {
  type: 'local',
  model: 'all-MiniLM-L6-v2',
  dimensions: ONNX_EMBEDDING_DIMENSIONS,
  batch: {
    enabled: true,
    maxBatchSize: 32,
    concurrency: 2,
  } as const,
};

// ===================== 单例状态 =====================

let currentConfig: EmbeddingProviderConfig = { ...DEFAULT_CONFIG };
let providerInitialized = false;
let initPromise: Promise<void> | null = null;

// 嵌入结果 LRU 缓存
const embeddingCache = new Map<string, Float32Array>();
const CACHE_MAX_SIZE = 512;

// ===================== 配置管理 =====================

/**
 * 配置嵌入提供者
 */
export function configureEmbeddingProvider(config: Partial<EmbeddingProviderConfig>): void {
  const currentBatch = currentConfig.batch ?? DEFAULT_CONFIG.batch;
  const newConfig: EmbeddingProviderConfig = {
    ...currentConfig,
    ...config,
    batch: {
      enabled: config.batch?.enabled ?? currentBatch.enabled,
      maxBatchSize: config.batch?.maxBatchSize ?? currentBatch.maxBatchSize,
      concurrency: config.batch?.concurrency ?? currentBatch.concurrency,
    },
  };

  // 如果 type 或 model 变化，标记需要重新初始化
  const typeChanged = newConfig.type !== currentConfig.type;
  const modelChanged = newConfig.model !== currentConfig.model;

  currentConfig = newConfig;

  if (typeChanged || modelChanged) {
    providerInitialized = false;
    initPromise = null;
    embeddingCache.clear();
    logger.info(`[EmbeddingProvider] 配置已更新: type=${newConfig.type}, model=${newConfig.model}`);
  }
}

/**
 * 获取当前配置
 */
export function getEmbeddingProviderConfig(): Readonly<EmbeddingProviderConfig> {
  return { ...currentConfig };
}

/**
 * 获取当前嵌入维度
 */
export function getEmbeddingDimensions(): number {
  return currentConfig.dimensions ?? ONNX_EMBEDDING_DIMENSIONS;
}

// ===================== 初始化 =====================

/**
 * 初始化嵌入提供者
 */
export async function initEmbeddingProvider(): Promise<void> {
  if (providerInitialized && initPromise) {
    return initPromise;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      if (currentConfig.type === 'local') {
        const status = getOnnxStatus();
        if (status.status !== 'ready') {
          await initOnnxEmbedding();
        }
        currentConfig.dimensions = ONNX_EMBEDDING_DIMENSIONS;
      }
      // 远程 provider 不需要预初始化
      providerInitialized = true;
      logger.info(`[EmbeddingProvider] 初始化完成: type=${currentConfig.type}, model=${currentConfig.model}, dims=${currentConfig.dimensions}`);
    } catch (err) {
      logger.error('[EmbeddingProvider] 初始化失败:', err instanceof Error ? err.message : String(err));
      // 初始化失败时降级到 local
      if (currentConfig.type !== 'local') {
        logger.warn('[EmbeddingProvider] 降级到本地 ONNX 嵌入');
        currentConfig.type = 'local';
        currentConfig.model = 'all-MiniLM-L6-v2';
        currentConfig.dimensions = ONNX_EMBEDDING_DIMENSIONS;
        const status = getOnnxStatus();
        if (status.status !== 'ready') {
          await initOnnxEmbedding();
        }
        providerInitialized = true;
      } else {
        throw err;
      }
    }
  })();

  return initPromise;
}

// ===================== 缓存管理 =====================

function getCacheKey(text: string, inputType: EmbeddingInputType): string {
  return `${currentConfig.type}:${currentConfig.model}:${inputType}:${text}`;
}

function cachePut(key: string, embedding: Float32Array): void {
  if (embeddingCache.size >= CACHE_MAX_SIZE) {
    // 删除最旧的条目（Map 按插入顺序迭代）
    const firstKey = embeddingCache.keys().next().value;
    if (firstKey !== undefined) {
      embeddingCache.delete(firstKey);
    }
  }
  embeddingCache.set(key, embedding);
}

// ===================== 单文本嵌入 =====================

/**
 * 生成单文本嵌入向量
 *
 * @param text 输入文本
 * @param inputType 输入类型（query/document）
 * @returns 嵌入结果
 */
export async function generateEmbedding(
  text: string,
  inputType: EmbeddingInputType = 'document',
): Promise<EmbeddingResult> {
  await initEmbeddingProvider();

  const cacheKey = getCacheKey(text, inputType);
  const cached = embeddingCache.get(cacheKey);
  if (cached) {
    return {
      embedding: cached,
      model: currentConfig.model,
      dimensions: currentConfig.dimensions ?? ONNX_EMBEDDING_DIMENSIONS,
    };
  }

  let embedding: Float32Array;

  switch (currentConfig.type) {
    case 'local':
      embedding = await embedLocal(text);
      break;
    case 'openai':
    case 'custom':
      embedding = await embedRemote(text, inputType);
      break;
    default:
      throw new Error(`Unknown embedding provider type: ${currentConfig.type}`);
  }

  // L2 归一化
  const normalized = l2Normalize(embedding);
  cachePut(cacheKey, normalized);

  return {
    embedding: normalized,
    model: currentConfig.model,
    dimensions: currentConfig.dimensions ?? ONNX_EMBEDDING_DIMENSIONS,
  };
}

// ===================== 批量嵌入 =====================

/**
 * 批量生成嵌入向量
 *
 * @param texts 文本数组
 * @param inputType 输入类型
 * @returns 批量嵌入结果
 */
export async function generateBatchEmbeddings(
  texts: string[],
  inputType: EmbeddingInputType = 'document',
): Promise<BatchEmbeddingResult> {
  if (texts.length === 0) {
    return {
      embeddings: [],
      model: currentConfig.model,
      dimensions: currentConfig.dimensions ?? ONNX_EMBEDDING_DIMENSIONS,
      totalTokens: 0,
    };
  }

  await initEmbeddingProvider();

  const embeddings: Float32Array[] = new Array(texts.length);
  const uncachedIndices: number[] = [];
  const uncachedTexts: string[] = [];

  // 先查缓存
  for (let i = 0; i < texts.length; i++) {
    const cacheKey = getCacheKey(texts[i], inputType);
    const cached = embeddingCache.get(cacheKey);
    if (cached) {
      embeddings[i] = cached;
    } else {
      uncachedIndices.push(i);
      uncachedTexts.push(texts[i]);
    }
  }

  if (uncachedTexts.length === 0) {
    return {
      embeddings,
      model: currentConfig.model,
      dimensions: currentConfig.dimensions ?? ONNX_EMBEDDING_DIMENSIONS,
      totalTokens: 0,
    };
  }

  let newEmbeddings: Float32Array[];
  let totalTokens = 0;

  switch (currentConfig.type) {
    case 'local':
      newEmbeddings = await embedBatchLocal(uncachedTexts);
      break;
    case 'openai':
    case 'custom':
      const remoteResult = await embedBatchRemote(uncachedTexts, inputType);
      newEmbeddings = remoteResult.embeddings;
      totalTokens = remoteResult.totalTokens;
      break;
    default:
      throw new Error(`Unknown embedding provider type: ${currentConfig.type}`);
  }

  // 归一化并存入结果和缓存
  for (let i = 0; i < newEmbeddings.length; i++) {
    const normalized = l2Normalize(newEmbeddings[i]);
    const textIndex = uncachedIndices[i];
    embeddings[textIndex] = normalized;
    const cacheKey = getCacheKey(uncachedTexts[i], inputType);
    cachePut(cacheKey, normalized);
  }

  return {
    embeddings,
    model: currentConfig.model,
    dimensions: currentConfig.dimensions ?? ONNX_EMBEDDING_DIMENSIONS,
    totalTokens,
  };
}

// ===================== Provider 实现 =====================

/**
 * 本地 ONNX 嵌入
 */
async function embedLocal(text: string): Promise<Float32Array> {
  return onnxEembedText(text);
}

/**
 * 本地 ONNX 批量嵌入
 */
async function embedBatchLocal(texts: string[]): Promise<Float32Array[]> {
  const results: Float32Array[] = [];
  const concurrency = currentConfig.batch?.concurrency ?? 2;

  // 并发控制
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, texts.length) }, async () => {
    while (index < texts.length) {
      const currentIndex = index++;
      results[currentIndex] = await onnxEembedText(texts[currentIndex]);
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * 远程 API 嵌入（OpenAI 兼容）
 */
async function embedRemote(text: string, inputType: EmbeddingInputType): Promise<Float32Array> {
  const result = await embedBatchRemote([text], inputType);
  return result.embeddings[0];
}

/**
 * 远程 API 批量嵌入
 */
async function embedBatchRemote(
  texts: string[],
  inputType: EmbeddingInputType,
): Promise<{ embeddings: Float32Array[]; totalTokens: number }> {
  const baseUrl = currentConfig.baseUrl ?? 'https://api.openai.com/v1';
  const apiKey = currentConfig.apiKey;
  const model = currentConfig.model;

  if (!apiKey) {
    throw new Error('Remote embedding provider requires API key');
  }

  const url = `${baseUrl.replace(/\/$/, '')}/embeddings`;

  const body: Record<string, unknown> = {
    model,
    input: texts,
  };

  // 仅支持降维的模型添加 dimensions 参数
  if (currentConfig.outputDimensionality && model.includes('text-embedding-3')) {
    body.dimensions = currentConfig.outputDimensionality;
  }

  // input_type 字段（部分 API 支持）
  if (model.includes('voyage') || model.includes('text-embedding')) {
    body.encoding_format = 'float';
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Embedding API error (${resp.status}): ${errText}`);
  }

  const data = await resp.json() as {
    data: Array<{ embedding: number[]; index: number }>;
    model: string;
    usage?: { prompt_tokens: number; total_tokens: number };
  };

  const embeddings: Float32Array[] = new Array(texts.length);
  for (const item of data.data) {
    embeddings[item.index] = new Float32Array(item.embedding);
  }

  // 如果有 outputDimensionality，更新配置
  if (currentConfig.outputDimensionality) {
    currentConfig.dimensions = currentConfig.outputDimensionality;
  } else if (data.data[0]?.embedding.length) {
    currentConfig.dimensions = data.data[0].embedding.length;
  }

  const totalTokens = data.usage?.total_tokens ?? 0;

  return { embeddings, totalTokens };
}

// ===================== 工具函数 =====================

/**
 * L2 归一化向量
 */
function l2Normalize(vec: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) {
    sum += vec[i] * vec[i];
  }
  const norm = Math.sqrt(sum);
  if (norm === 0) return vec;

  const result = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    result[i] = vec[i] / norm;
  }
  return result;
}

/**
 * 清除嵌入缓存
 */
export function clearEmbeddingCache(): void {
  embeddingCache.clear();
}

/**
 * 获取缓存状态
 */
export function getEmbeddingCacheStats(): { size: number; maxSize: number } {
  return {
    size: embeddingCache.size,
    maxSize: CACHE_MAX_SIZE,
  };
}

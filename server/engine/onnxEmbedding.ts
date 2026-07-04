/**
 * OnnxEmbeddingEngine — 本地 ONNX 推理 Embedding 引擎
 *
 * 使用 onnxruntime-node + Xenova/all-MiniLM-L6-v2 ONNX 模型
 * 在本地生成 384 维语义向量，无需外部 API。
 *
 * 核心职责：
 * - 加载 ONNX 模型 + tokenizer
 * - 文本 → 384 维 Float32Array（L2 归一化）
 * - 批量推理
 * - 首次使用自动下载模型到 ~/.cdf-know-clow/models/
 */

import * as ort from 'onnxruntime-node';
import path from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import https from 'https';
import { logger } from '../logger.js';

// ===================== 常量 =====================

/** 模型文件目录 */
const MODEL_DIR = path.join(homedir(), '.cdf-know-clow', 'models', 'all-MiniLM-L6-v2');

/** ONNX 模型文件路径 */
const ONNX_MODEL_PATH = path.join(MODEL_DIR, 'model.onnx');

/** tokenizer 配置文件路径 */
const TOKENIZER_PATH = path.join(MODEL_DIR, 'tokenizer.json');

/** vocab 文件路径 */
const VOCAB_PATH = path.join(MODEL_DIR, 'vocab.txt');

/** config.json 路径 */
const CONFIG_PATH = path.join(MODEL_DIR, 'config.json');

/** 向量维度（all-MiniLM-L6-v2 固定 384 维） */
export const ONNX_EMBEDDING_DIMENSIONS = 384;

/** 模型最大输入长度（tokens） */
const MAX_SEQ_LENGTH = 256;

/** HuggingFace 模型文件下载基础 URL */
const HF_BASE_URL = 'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main';

// ===================== 单例状态 =====================

/** ONNX 推理会话 */
let session: ort.InferenceSession | null = null;

/** 初始化 Promise — 避免并发初始化 */
let initPromise: Promise<void> | null = null;

/** 是否已完成初始化 */
let isInitialized = false;

/** vocab 映射 */
const vocabMap: Map<string, number> = new Map();

/** 模型配置 */
let modelConfig: { max_position_embeddings?: number; hidden_size?: number } = {};

/** 初始化错误信息 */
let initError: string = '';

/** 最后使用时间戳（用于空闲自动释放） */
let lastUsedAt = 0;

/** 空闲超时：30 分钟 */
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

// P0: LRU 推理结果缓存 — 避免相同文本重复 ONNX 推理
const embeddingCache = new Map<string, Float32Array>();
const EMBEDDING_CACHE_MAX = 256;

// P1: Tensor 内存池 — 预分配并复用，减少 GC 压力
let pooledInputIdsTensor: ort.Tensor | null = null;
let pooledAttentionMaskTensor: ort.Tensor | null = null;
let pooledInputIdsData: BigInt64Array | null = null;
let pooledAttentionMaskData: BigInt64Array | null = null;

// P1: tokenizer.json 预编译缓存
let tokenizerJsonLoaded = false;
let tokenizerPrecompiled: {
  vocab: Record<string, number>;
  normalizer?: { pattern?: string; replacement?: string };
  preTokenizer?: { pattern?: string };
} | null = null;

// ===================== 空闲自动释放定时器 =====================

/** 更新最后使用时间 */
function touchLastUsed(): void {
  lastUsedAt = Date.now();
}

const idleCheckTimer = setInterval(() => {
  if (session && lastUsedAt > 0 && Date.now() - lastUsedAt > IDLE_TIMEOUT_MS) {
    disposeEmbeddingModel();
    logger.info('[ONNX] Embedding 模型因空闲超过30分钟已自动释放');
  }
}, 5 * 60 * 1000);
idleCheckTimer.unref();

// ===================== 模型下载 =====================

/**
 * 下载单个文件到本地（带超时和重试）
 */
function downloadFile(url: string, dest: string, retries = 2, timeoutMs = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    const attempt = (remaining: number): void => {
      const chunks: Buffer[] = [];
      let timedOut = false;

      const req = https.get(url, (response) => {
        // 处理重定向（301/302/307/308）
        if ([301, 302, 307, 308].includes(response.statusCode!) && response.headers.location) {
          let redirectUrl = response.headers.location;
          if (redirectUrl.startsWith('/')) {
            const originalUrl = new URL(url);
            redirectUrl = `${originalUrl.protocol}//${originalUrl.host}${redirectUrl}`;
          }
          downloadFile(redirectUrl, dest, 0, timeoutMs).then(resolve).catch(reject);
          return;
        }
        if (response.statusCode !== 200) {
          reject(new Error(`下载失败: ${response.statusCode}`));
          return;
        }

        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          if (timedOut) return;
          try {
            writeFileSync(dest, Buffer.concat(chunks));
            resolve();
          } catch (e) {
            reject(e);
          }
        });
        response.on('error', reject);
      });

      // 超时控制
      req.setTimeout(timeoutMs, () => {
        timedOut = true;
        req.destroy();
        if (remaining > 0) {
          logger.debug(`[OnnxEmbedding] 下载超时，剩余重试 ${remaining} 次...`);
          attempt(remaining - 1);
        } else {
          reject(new Error(`下载超时 (${timeoutMs}ms)，已重试 ${retries} 次: ${url}`));
        }
      });

      req.on('error', (err) => {
        if (timedOut) return;
        if (remaining > 0) {
          logger.debug(`[OnnxEmbedding] 下载失败，剩余重试 ${remaining} 次: ${err.message}`);
          attempt(remaining - 1);
        } else {
          reject(err);
        }
      });
    };

    attempt(retries);
  });
}

/**
 * 确保模型文件存在，不存在则自动下载
 */
async function ensureModelFiles(): Promise<void> {
  mkdirSync(MODEL_DIR, { recursive: true });

  const filesToDownload: Array<{ url: string; path: string; name: string }> = [];

  if (!existsSync(ONNX_MODEL_PATH)) {
    filesToDownload.push({
      url: `${HF_BASE_URL}/onnx/model_quantized.onnx`,
      path: ONNX_MODEL_PATH,
      name: 'model_quantized.onnx',
    });
  }

  if (!existsSync(TOKENIZER_PATH)) {
    filesToDownload.push({
      url: `${HF_BASE_URL}/tokenizer.json`,
      path: TOKENIZER_PATH,
      name: 'tokenizer.json',
    });
  }

  if (!existsSync(VOCAB_PATH)) {
    filesToDownload.push({
      url: `${HF_BASE_URL}/vocab.txt`,
      path: VOCAB_PATH,
      name: 'vocab.txt',
    });
  }

  if (!existsSync(CONFIG_PATH)) {
    filesToDownload.push({
      url: `${HF_BASE_URL}/config.json`,
      path: CONFIG_PATH,
      name: 'config.json',
    });
  }

  if (filesToDownload.length === 0) return;

  logger.debug(`[OnnxEmbedding] 下载模型文件 (${filesToDownload.length} 个)...`);
  for (const file of filesToDownload) {
    logger.debug(`[OnnxEmbedding] 下载 ${file.name}...`);
    await downloadFile(file.url, file.path);
    logger.debug(`[OnnxEmbedding] ${file.name} 下载完成`);
  }
}

// ===================== Tokenizer =====================

/**
 * 加载 vocab.txt 构建 token→id 映射
 */
function loadVocab(): void {
  const vocabText = readFileSync(VOCAB_PATH, 'utf-8');
  const tokens = vocabText.split('\n').filter(t => t.length > 0);
  vocabMap.clear();
  for (let i = 0; i < tokens.length; i++) {
    vocabMap.set(tokens[i], i);
  }
  logger.debug(`[OnnxEmbedding] vocab 加载完成: ${vocabMap.size} 个 token`);
}

/**
 * 加载 config.json
 */
function loadConfig(): void {
  try {
    const configText = readFileSync(CONFIG_PATH, 'utf-8');
    modelConfig = JSON.parse(configText);
  } catch {
    modelConfig = {};
  }
}

/**
 * P1: 加载 tokenizer.json 预编译规则
 */
function loadTokenizerJson(): void {
  if (tokenizerJsonLoaded) return;
  try {
    const raw = readFileSync(TOKENIZER_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    tokenizerPrecompiled = {
      vocab: parsed.model?.vocab ?? {},
      normalizer: parsed.normalizer?.type === 'BertNormalizer'
        ? { pattern: 'BertNormalizer', replacement: '' }
        : undefined,
      preTokenizer: parsed.pre_tokenizer?.type === 'BertPreTokenizer'
        ? { pattern: 'BertPreTokenizer' }
        : undefined,
    };
    // 将 tokenizer.json 的 vocab 合并到 vocabMap（作为后备）
    const tVocab = tokenizerPrecompiled.vocab;
    for (const [token, id] of Object.entries(tVocab)) {
      if (!vocabMap.has(token)) {
        vocabMap.set(token, id);
      }
    }
    logger.debug(`[OnnxEmbedding] tokenizer.json 预编译完成: ${Object.keys(tVocab).length} 个 token`);
  } catch (e) {
    logger.warn('[OnnxEmbedding] tokenizer.json 加载失败，回退到 vocab.txt:', e instanceof Error ? e.message : String(e));
    tokenizerPrecompiled = null;
  }
  tokenizerJsonLoaded = true;
}

/**
 * WordPiece 分词（BERT 风格）
 * P1: vocabMap 已在 init 时构建，不再每次重新创建
 */
function tokenize(text: string): { inputIds: number[]; attentionMask: number[] } {
  // 基础预处理：小写化、去除多余空格
  const normalized = text.toLowerCase().trim().replace(/\s+/g, ' ');

  // WordPiece 分词
  const tokens: string[] = ['[CLS]'];
  const words = normalized.match(/\S+/g) || [];

  for (const word of words) {
    // 简单处理：按子词匹配
    let remaining = word;
    const subTokens: string[] = [];

    while (remaining.length > 0) {
      if (subTokens.length === 0) {
        // 第一个子词不加 ## 前缀
        if (vocabMap.has(remaining)) {
          subTokens.push(remaining);
          break;
        }
      } else {
        // 后续子词加 ## 前缀
        if (vocabMap.has(`##${remaining}`)) {
          subTokens.push(`##${remaining}`);
          break;
        }
      }

      // 逐步截短
      let found = false;
      for (let i = remaining.length - 1; i > 0; i--) {
        const candidate = remaining.substring(0, i);
        const suffix = remaining.substring(i);
        const tokenToCheck = subTokens.length === 0 ? candidate : `##${candidate}`;
        if (vocabMap.has(tokenToCheck)) {
          subTokens.push(tokenToCheck);
          remaining = suffix;
          found = true;
          break;
        }
      }

      if (!found) {
        // 未知词，使用 [UNK]
        subTokens.push('[UNK]');
        break;
      }
    }

    for (const st of subTokens) {
      tokens.push(st);
      if (tokens.length >= MAX_SEQ_LENGTH - 1) break;
    }
    if (tokens.length >= MAX_SEQ_LENGTH - 1) break;
  }

  tokens.push('[SEP]');

  // 截断到最大长度
  const truncated = tokens.slice(0, MAX_SEQ_LENGTH);

  // 转换为 input_ids
  const inputIds = truncated.map(t => vocabMap.get(t) ?? vocabMap.get('[UNK]') ?? 0);
  const attentionMask = new Array(truncated.length).fill(1);

  // 填充到 MAX_SEQ_LENGTH
  while (inputIds.length < MAX_SEQ_LENGTH) {
    inputIds.push(0);
    attentionMask.push(0);
  }

  return { inputIds, attentionMask };
}

// ===================== 推理 =====================

/**
 * 确保推理会话已初始化（懒加载 + 并发安全）
 * 首次调用时才创建 ONNX InferenceSession，避免模块加载时占用内存
 */
async function ensureSession(): Promise<ort.InferenceSession> {
  if (session && isInitialized) return session;
  if (initPromise) {
    await initPromise;
    return session!;
  }

  initPromise = (async () => {
    logger.debug('[OnnxEmbedding] 懒加载初始化中...');
    await ensureModelFiles();

    loadVocab();
    loadConfig();
    loadTokenizerJson();

    session = await ort.InferenceSession.create(ONNX_MODEL_PATH, {
      executionMode: 'parallel',
      graphOptimizationLevel: 'all',
      intraOpNumThreads: 2,
      interOpNumThreads: 1,
    });

    // 预分配 Tensor 内存池
    pooledInputIdsData = new BigInt64Array(MAX_SEQ_LENGTH);
    pooledAttentionMaskData = new BigInt64Array(MAX_SEQ_LENGTH);
    pooledInputIdsTensor = new ort.Tensor('int64', pooledInputIdsData, [1, MAX_SEQ_LENGTH]);
    pooledAttentionMaskTensor = new ort.Tensor('int64', pooledAttentionMaskData, [1, MAX_SEQ_LENGTH]);

    isInitialized = true;
    touchLastUsed();
    logger.debug('[OnnxEmbedding] 初始化完成, 输入:', session.inputNames, '输出:', session.outputNames);
  })();

  try {
    await initPromise;
  } catch (e) {
    initPromise = null;
    initError = e instanceof Error ? e.message : String(e);
    logger.error('[OnnxEmbedding] 初始化失败:', initError);
    throw e;
  }

  return session!;
}

/**
 * 初始化 ONNX 推理会话（向后兼容入口）
 */
export async function initOnnxEmbedding(): Promise<void> {
  await ensureSession();
}

/**
 * 释放 ONNX 推理会话，回收内存
 */
export function disposeEmbeddingModel(): void {
  if (session) {
    session.release();
    session = null;
    isInitialized = false;
    initPromise = null;
    lastUsedAt = 0;

    // 同时释放内存池
    pooledInputIdsTensor = null;
    pooledAttentionMaskTensor = null;
    pooledInputIdsData = null;
    pooledAttentionMaskData = null;

    logger.info('[ONNX] Embedding 模型已释放');
  }
}

/**
 * 获取初始化状态
 */
export function getOnnxStatus(): { status: string; error: string } {
  if (isInitialized) return { status: 'ready', error: '' };
  if (initPromise) return { status: 'loading', error: '' };
  return { status: 'idle', error: initError };
}

/**
 * 对单条文本生成 embedding 向量
 *
 * @param text 输入文本
 * @returns 384 维 L2 归一化 Float32Array
 */
export async function embedText(text: string): Promise<Float32Array> {
  const sess = await ensureSession();
  touchLastUsed();

  // P0: 缓存命中检查
  // P1 fix: 使用完整文本的 SHA-256 哈希作为缓存键，避免长文本截断导致错误命中
  const cacheKey = text.length > 200
    ? createHash('sha256').update(text).digest('hex')
    : text;
  const cached = embeddingCache.get(cacheKey);
  if (cached) {
    // P0 fix: 缓存命中时删除并重新插入，将条目移到 Map 末尾（最近使用），
    // 实现真正的 LRU 语义而非 FIFO
    embeddingCache.delete(cacheKey);
    embeddingCache.set(cacheKey, cached);
    return cached;
  }

  const { inputIds, attentionMask } = tokenize(text);

  // P1: Tensor 内存池复用 — 直接更新 data 而不是重新创建 Tensor
  if (pooledInputIdsData && pooledAttentionMaskData && pooledInputIdsTensor && pooledAttentionMaskTensor) {
    for (let i = 0; i < MAX_SEQ_LENGTH; i++) {
      pooledInputIdsData[i] = BigInt(inputIds[i]);
      pooledAttentionMaskData[i] = BigInt(attentionMask[i]);
    }
  } else {
    // 回退：重新创建 Tensor（理论上不会走到这里）
    pooledInputIdsTensor = new ort.Tensor('int64', BigInt64Array.from(inputIds.map(n => BigInt(n))), [1, MAX_SEQ_LENGTH]);
    pooledAttentionMaskTensor = new ort.Tensor('int64', BigInt64Array.from(attentionMask.map(n => BigInt(n))), [1, MAX_SEQ_LENGTH]);
  }

  // 推理
  const inputName0 = sess.inputNames[0]; // input_ids
  const inputName1 = sess.inputNames[1]; // attention_mask
  const feeds: Record<string, ort.Tensor> = {};
  feeds[inputName0] = pooledInputIdsTensor;
  feeds[inputName1] = pooledAttentionMaskTensor;

  const output = await sess.run(feeds);

  // 获取 last_hidden_state（输出名通常是 last_hidden_state）
  const outputName = sess.outputNames[0];
  const hiddenStates = output[outputName];
  const data = hiddenStates.data as Float32Array;

  // mean pooling: [1, seq_len, 384] → [384]
  const dim = ONNX_EMBEDDING_DIMENSIONS;
  const seqLen = MAX_SEQ_LENGTH;
  const pooled = new Float32Array(dim);

  let validCount = 0;
  for (let i = 0; i < seqLen; i++) {
    if (attentionMask[i] === 1) {
      for (let j = 0; j < dim; j++) {
        pooled[j] += data[i * dim + j];
      }
      validCount++;
    }
  }

  // 平均池化
  if (validCount > 0) {
    for (let j = 0; j < dim; j++) {
      pooled[j] /= validCount;
    }
  }

  // L2 归一化
  let norm = 0;
  for (let j = 0; j < dim; j++) {
    norm += pooled[j] * pooled[j];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let j = 0; j < dim; j++) {
      pooled[j] /= norm;
    }
  }

  // P0: 写入 LRU 缓存
  if (embeddingCache.size >= EMBEDDING_CACHE_MAX) {
    const firstKey = embeddingCache.keys().next().value;
    if (firstKey) embeddingCache.delete(firstKey);
  }
  embeddingCache.set(cacheKey, pooled);

  return pooled;
}

/**
 * P1: 批量生成 embedding — 真正的批量推理
 * 将多条文本 padding 到相同长度后拼接为 [batch, 256] tensor，一次推理完成
 *
 * @param texts 输入文本数组
 * @returns 384 维 L2 归一化 Float32Array 数组
 */
export async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  const sess = await ensureSession();
  touchLastUsed();

  // 单条时直接走 embedText（复用内存池）
  if (texts.length === 1) {
    return [await embedText(texts[0])];
  }

  const batchSize = texts.length;

  // 1. 对所有文本分词
  const tokenized = texts.map(t => tokenize(t));

  // 2. 构建 batch tensor [batchSize, MAX_SEQ_LENGTH]
  const batchInputIds = new BigInt64Array(batchSize * MAX_SEQ_LENGTH);
  const batchAttentionMask = new BigInt64Array(batchSize * MAX_SEQ_LENGTH);

  for (let b = 0; b < batchSize; b++) {
    const { inputIds, attentionMask } = tokenized[b];
    const offset = b * MAX_SEQ_LENGTH;
    for (let i = 0; i < MAX_SEQ_LENGTH; i++) {
      batchInputIds[offset + i] = BigInt(inputIds[i]);
      batchAttentionMask[offset + i] = BigInt(attentionMask[i]);
    }
  }

  const inputIdsTensor = new ort.Tensor('int64', batchInputIds, [batchSize, MAX_SEQ_LENGTH]);
  const attentionMaskTensor = new ort.Tensor('int64', batchAttentionMask, [batchSize, MAX_SEQ_LENGTH]);

  // 3. 一次推理
  const inputName0 = sess.inputNames[0];
  const inputName1 = sess.inputNames[1];
  const feeds: Record<string, ort.Tensor> = {};
  feeds[inputName0] = inputIdsTensor;
  feeds[inputName1] = attentionMaskTensor;

  const output = await sess.run(feeds);

  // 4. 解析输出 [batchSize, seqLen, 384]
  const outputName = sess.outputNames[0];
  const hiddenStates = output[outputName];
  const data = hiddenStates.data as Float32Array;
  const dim = ONNX_EMBEDDING_DIMENSIONS;

  const results: Float32Array[] = [];

  for (let b = 0; b < batchSize; b++) {
    const { attentionMask } = tokenized[b];
    const pooled = new Float32Array(dim);
    let validCount = 0;

    for (let i = 0; i < MAX_SEQ_LENGTH; i++) {
      if (attentionMask[i] === 1) {
        const idx = (b * MAX_SEQ_LENGTH + i) * dim;
        for (let j = 0; j < dim; j++) {
          pooled[j] += data[idx + j];
        }
        validCount++;
      }
    }

    if (validCount > 0) {
      for (let j = 0; j < dim; j++) {
        pooled[j] /= validCount;
      }
    }

    // L2 归一化
    let norm = 0;
    for (let j = 0; j < dim; j++) {
      norm += pooled[j] * pooled[j];
    }
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let j = 0; j < dim; j++) {
        pooled[j] /= norm;
      }
    }

    results.push(pooled);
  }

  return results;
}

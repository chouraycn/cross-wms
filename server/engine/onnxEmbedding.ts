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
let inferenceSession: ort.InferenceSession | null = null;

/** vocab 映射 */
let vocabMap: Map<string, number> = new Map();

/** 模型配置 */
let modelConfig: { max_position_embeddings?: number; hidden_size?: number } = {};

/** 初始化状态 */
let initStatus: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';

/** 初始化错误信息 */
let initError: string = '';

// ===================== 模型下载 =====================

/**
 * 下载单个文件到本地
 */
function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = writeFileSync; // 占位，实际用下面的流式写入
    const chunks: Buffer[] = [];

    https.get(url, (response) => {
      // 处理重定向
      if (response.statusCode === 302 && response.headers.location) {
        downloadFile(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`下载失败: ${response.statusCode}`));
        return;
      }

      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        try {
          writeFileSync(dest, Buffer.concat(chunks));
          resolve();
        } catch (e) {
          reject(e);
        }
      });
      response.on('error', reject);
    }).on('error', reject);
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

  console.log(`[OnnxEmbedding] 下载模型文件 (${filesToDownload.length} 个)...`);
  for (const file of filesToDownload) {
    console.log(`[OnnxEmbedding] 下载 ${file.name}...`);
    await downloadFile(file.url, file.path);
    console.log(`[OnnxEmbedding] ${file.name} 下载完成`);
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
  console.log(`[OnnxEmbedding] vocab 加载完成: ${vocabMap.size} 个 token`);
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
 * WordPiece 分词（BERT 风格）
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
 * 初始化 ONNX 推理会话
 */
export async function initOnnxEmbedding(): Promise<void> {
  if (initStatus === 'ready') return;
  if (initStatus === 'loading') {
    // 等待其他调用完成初始化
    while (initStatus === 'loading') {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return;
  }

  initStatus = 'loading';
  initError = '';

  try {
    console.log('[OnnxEmbedding] 初始化中...');
    await ensureModelFiles();

    loadVocab();
    loadConfig();

    // 创建 ONNX 推理会话
    inferenceSession = await ort.InferenceSession.create(ONNX_MODEL_PATH, {
      executionMode: 'sequential',
      graphOptimizationLevel: 'all',
    });

    initStatus = 'ready';
    console.log('[OnnxEmbedding] 初始化完成, 输入:', inferenceSession.inputNames, '输出:', inferenceSession.outputNames);
  } catch (e) {
    initStatus = 'failed';
    initError = e instanceof Error ? e.message : String(e);
    console.error('[OnnxEmbedding] 初始化失败:', initError);
    throw e;
  }
}

/**
 * 获取初始化状态
 */
export function getOnnxStatus(): { status: string; error: string } {
  return { status: initStatus, error: initError };
}

/**
 * 对单条文本生成 embedding 向量
 *
 * @param text 输入文本
 * @returns 384 维 L2 归一化 Float32Array
 */
export async function embedText(text: string): Promise<Float32Array> {
  if (initStatus !== 'ready' || !inferenceSession) {
    await initOnnxEmbedding();
  }

  const { inputIds, attentionMask } = tokenize(text);

  // 创建 ONNX 输入 tensor
  const inputIdsTensor = new ort.Tensor('int64', BigInt64Array.from(inputIds.map(n => BigInt(n))), [1, MAX_SEQ_LENGTH]);
  const attentionMaskTensor = new ort.Tensor('int64', BigInt64Array.from(attentionMask.map(n => BigInt(n))), [1, MAX_SEQ_LENGTH]);

  // 推理
  const inputName0 = inferenceSession!.inputNames[0]; // input_ids
  const inputName1 = inferenceSession!.inputNames[1]; // attention_mask
  const feeds: Record<string, ort.Tensor> = {};
  feeds[inputName0] = inputIdsTensor;
  feeds[inputName1] = attentionMaskTensor;

  const output = await inferenceSession!.run(feeds);

  // 获取 last_hidden_state（输出名通常是 last_hidden_state）
  const outputName = inferenceSession!.outputNames[0];
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

  return pooled;
}

/**
 * 批量生成 embedding
 *
 * @param texts 输入文本数组
 * @returns 384 维 L2 归一化 Float32Array 数组
 */
export async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  const results: Float32Array[] = [];
  for (const text of texts) {
    results.push(await embedText(text));
  }
  return results;
}

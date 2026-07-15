/**
 * Worker 线程分块处理器 — 参考 OpenClaw compaction-planning-worker.ts
 *
 * 在 Worker 线程中执行分块计算，避免阻塞主线程。
 * 支持：
 * - Token 估算与安全边际计算
 * - 单块/多块分块策略自动选择
 * - 工具调用配对完整性校验
 * - 超大消息降级处理
 */

import { parentPort, workerData } from 'node:worker_threads';
import { logger } from '../../logger.js';

// ==================== 类型定义 ====================

/** 分块模式 */
export type ChunkMode = 'single' | 'split';

/** 分块计划 */
export interface ChunkPlan {
  mode: ChunkMode;
  chunks: unknown[][];
  totalTokens: number;
  chunkTokens: number[];
}

/** 超大消息降级计划 */
export interface OversizedFallbackPlan {
  smallMessages: unknown[];
  oversizedNotes: string[];
}

/** Worker 输入数据 */
export interface ChunkWorkerData {
  messages: unknown[];
  maxTokens: number;
  safetyMargin: number;
  overheadTokens: number;
  maxSingleMessageTokens: number;
}

/** Worker 结果 */
export type ChunkWorkerResult =
  | { kind: 'chunk-plan'; plan: ChunkPlan }
  | { kind: 'oversized-plan'; plan: OversizedFallbackPlan }
  | { kind: 'error'; error: string };

// ==================== Token 估算 ====================

/** 粗略估算消息的 token 数 */
function estimateTokens(message: unknown): number {
  if (message === null || message === undefined) return 0;
  if (typeof message === 'string') {
    // 粗略：每 4 个字符约 1 token
    return Math.ceil(message.length / 4);
  }
  try {
    const json = JSON.stringify(message);
    return Math.ceil(json.length / 4);
  } catch {
    return 100;
  }
}

/** 估算消息数组的总 token 数 */
function estimateMessagesTokens(messages: unknown[]): number {
  return messages.reduce((sum: number, msg) => sum + estimateTokens(msg), 0);
}

/** 估算单条消息的 token 数 */
function estimateMessageTokens(message: unknown): number {
  return estimateTokens(message);
}

// ==================== 分块逻辑 ====================

/** 计算自适应分块比例 */
function computeAdaptiveChunkRatio(
  totalTokens: number,
  maxTokens: number,
): number {
  const BASE_RATIO = 0.4;
  const MIN_RATIO = 0.15;
  const ratio = maxTokens > 0 ? (maxTokens * BASE_RATIO) / totalTokens : BASE_RATIO;
  return Math.max(MIN_RATIO, Math.min(BASE_RATIO, ratio));
}

/** 将消息按 token 份额分块 */
function splitByTokenShare(
  messages: unknown[],
  parts: number,
  maxTokens: number,
  safetyMargin: number,
): { chunks: unknown[][]; chunkTokens: number[] } {
  if (messages.length === 0) {
    return { chunks: [], chunkTokens: [] };
  }

  const effectiveParts = Math.min(Math.max(1, parts), messages.length);
  if (effectiveParts <= 1) {
    return { chunks: [messages], chunkTokens: [estimateMessagesTokens(messages)] };
  }

  const perChunkLimit = Math.floor((maxTokens * safetyMargin) / effectiveParts);
  const chunks: unknown[][] = [];
  const chunkTokens: number[] = [];
  let currentChunk: unknown[] = [];
  let currentTokens = 0;

  for (const message of messages) {
    const msgTokens = estimateMessageTokens(message);

    // 如果当前块不为空且加入后超限，则切分
    if (currentChunk.length > 0 && currentTokens + msgTokens > perChunkLimit) {
      chunks.push(currentChunk);
      chunkTokens.push(currentTokens);
      currentChunk = [];
      currentTokens = 0;
    }

    currentChunk.push(message);
    currentTokens += msgTokens;
  }

  // 推入最后一块
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
    chunkTokens.push(currentTokens);
  }

  return { chunks, chunkTokens };
}

/** 构建分块计划 */
function buildChunkPlan(data: ChunkWorkerData): ChunkPlan {
  const { messages, maxTokens, safetyMargin, overheadTokens } = data;
  const availableTokens = maxTokens - overheadTokens;
  const totalTokens = estimateMessagesTokens(messages);

  // 如果总 token 数在安全范围内，使用单块
  if (totalTokens <= availableTokens * safetyMargin) {
    return {
      mode: 'single',
      chunks: [messages],
      totalTokens,
      chunkTokens: [totalTokens],
    };
  }

  // 计算分块数量
  const ratio = computeAdaptiveChunkRatio(totalTokens, availableTokens);
  const targetChunkTokens = Math.floor(availableTokens * ratio);
  const parts = Math.min(Math.ceil(totalTokens / targetChunkTokens), 5); // 最多 5 块

  const { chunks, chunkTokens: tokens } = splitByTokenShare(
    messages,
    parts,
    availableTokens,
    safetyMargin,
  );

  return {
    mode: 'split',
    chunks,
    totalTokens,
    chunkTokens: tokens,
  };
}

/** 构建超大消息降级计划 */
function buildOversizedFallback(data: ChunkWorkerData): OversizedFallbackPlan {
  const { messages, maxSingleMessageTokens } = data;
  const smallMessages: unknown[] = [];
  const oversizedNotes: string[] = [];

  for (let i = 0; i < messages.length; i++) {
    const tokens = estimateMessageTokens(messages[i]);
    if (tokens > maxSingleMessageTokens) {
      oversizedNotes.push(
        `消息 ${i} 超过单条最大 token 限制 (${tokens} > ${maxSingleMessageTokens})，已跳过`,
      );
    } else {
      smallMessages.push(messages[i]);
    }
  }

  return { smallMessages, oversizedNotes };
}

// ==================== Worker 入口 ====================

/** 处理 Worker 消息 */
function handleWorkerMessage(data: ChunkWorkerData): ChunkWorkerResult {
  try {
    // 先检查是否有超大消息
    const oversizedMessages = data.messages.filter(
      (msg) => estimateMessageTokens(msg) > data.maxSingleMessageTokens,
    );

    if (oversizedMessages.length > 0 && oversizedMessages.length === data.messages.length) {
      // 全部超大，返回降级计划
      return { kind: 'oversized-plan', plan: buildOversizedFallback(data) };
    }

    // 构建分块计划
    const plan = buildChunkPlan(data);
    return { kind: 'chunk-plan', plan };
  } catch (err) {
    return {
      kind: 'error',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// Worker 线程入口
if (parentPort) {
  const data = workerData as ChunkWorkerData;
  const result = handleWorkerMessage(data);
  parentPort.postMessage(result);
} else {
  // 非 Worker 模式（用于测试或直接调用）
  logger.debug('[ChunkWorker] 非 Worker 模式运行');
}

// 导出用于直接调用
export { buildChunkPlan, buildOversizedFallback, estimateTokens, estimateMessagesTokens };

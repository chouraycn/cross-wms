/**
 * Batch Manager — 批量生成管理
 *
 * 管理批量图像生成任务，包括任务队列、并发控制、进度跟踪、批量状态管理等。
 */

import { logger } from "../../logger.js";
import type { GenerateImageParams } from "./runtime.js";
import type { GeneratedImageAsset } from "./types.js";

export type BatchStatus = "pending" | "queued" | "running" | "paused" | "completed" | "failed" | "cancelled";

export type BatchItemStatus = "pending" | "queued" | "running" | "completed" | "failed" | "skipped";

export type BatchTask = {
  id: string;
  status: BatchStatus;
  name?: string;
  items: BatchItem[];
  concurrency: number;
  priority: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  currentIndex: number;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  skippedItems: number;
  metadata?: Record<string, unknown>;
};

export type BatchItem = {
  id: string;
  status: BatchItemStatus;
  prompt: string;
  params: GenerateImageParams;
  images?: GeneratedImageAsset[];
  error?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  provider?: string;
  model?: string;
  retries: number;
  maxRetries: number;
  index: number;
  metadata?: Record<string, unknown>;
};

export type CreateBatchOptions = {
  name?: string;
  concurrency?: number;
  priority?: number;
  maxRetries?: number;
  metadata?: Record<string, unknown>;
};

export type BatchProgress = {
  batchId: string;
  status: BatchStatus;
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  currentIndex: number;
  progressPercent: number;
  estimatedRemainingMs?: number;
  elapsedMs?: number;
};

const batches: Map<string, BatchTask> = new Map();
const batchCallbacks: Map<string, Array<(progress: BatchProgress) => void>> = new Map();

let isProcessing = false;

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createBatch(
  prompts: string[],
  baseParams: Partial<GenerateImageParams> = {},
  options: CreateBatchOptions = {},
): BatchTask {
  const batchId = generateId("batch");
  const items: BatchItem[] = prompts.map((prompt, index) => ({
    id: generateId("item"),
    status: "pending" as BatchItemStatus,
    prompt,
    params: {
      ...baseParams,
      prompt,
    } as GenerateImageParams,
    createdAt: Date.now(),
    retries: 0,
    maxRetries: options.maxRetries || 2,
    index,
  }));

  const batch: BatchTask = {
    id: batchId,
    status: "pending",
    name: options.name,
    items,
    concurrency: options.concurrency || 2,
    priority: options.priority || 5,
    createdAt: Date.now(),
    currentIndex: 0,
    totalItems: items.length,
    completedItems: 0,
    failedItems: 0,
    skippedItems: 0,
    metadata: options.metadata,
  };

  batches.set(batchId, batch);
  logger.info(
    `[BatchManager] Created batch ${batchId} with ${items.length} items (concurrency: ${batch.concurrency})`,
  );

  return batch;
}

export function getBatch(batchId: string): BatchTask | undefined {
  return batches.get(batchId);
}

export function listBatches(status?: BatchStatus): BatchTask[] {
  const all = Array.from(batches.values());
  if (status) {
    return all.filter((b) => b.status === status);
  }
  return all;
}

export function getBatchProgress(batchId: string): BatchProgress | undefined {
  const batch = batches.get(batchId);
  if (!batch) return undefined;

  const completed = batch.completedItems;
  const total = batch.totalItems;
  const progressPercent = total > 0 ? (completed / total) * 100 : 0;

  let elapsedMs: number | undefined;
  let estimatedRemainingMs: number | undefined;

  if (batch.startedAt) {
    elapsedMs = Date.now() - batch.startedAt;
    if (completed > 0) {
      const avgPerItem = elapsedMs / completed;
      estimatedRemainingMs = avgPerItem * (total - completed);
    }
  }

  return {
    batchId,
    status: batch.status,
    total,
    completed,
    failed: batch.failedItems,
    skipped: batch.skippedItems,
    currentIndex: batch.currentIndex,
    progressPercent,
    estimatedRemainingMs,
    elapsedMs,
  };
}

export function startBatch(batchId: string): boolean {
  const batch = batches.get(batchId);
  if (!batch) return false;
  if (batch.status === "running") return false;

  batch.status = "queued";
  batch.startedAt = Date.now();

  for (const item of batch.items) {
    if (item.status === "pending") {
      item.status = "queued";
    }
  }

  logger.info(`[BatchManager] Batch ${batchId} queued for processing`);

  processNextBatch();

  return true;
}

export function pauseBatch(batchId: string): boolean {
  const batch = batches.get(batchId);
  if (!batch) return false;
  if (batch.status !== "running" && batch.status !== "queued" && batch.status !== "pending") return false;

  batch.status = "paused";

  for (const item of batch.items) {
    if (item.status === "queued") {
      item.status = "pending";
    }
  }

  logger.info(`[BatchManager] Batch ${batchId} paused`);
  emitProgress(batchId);
  return true;
}

export function resumeBatch(batchId: string): boolean {
  const batch = batches.get(batchId);
  if (!batch) return false;
  if (batch.status !== "paused") return false;

  batch.status = "queued";

  for (const item of batch.items) {
    if (item.status === "pending") {
      item.status = "queued";
    }
  }

  logger.info(`[BatchManager] Batch ${batchId} resumed`);
  processNextBatch();
  return true;
}

export function cancelBatch(batchId: string): boolean {
  const batch = batches.get(batchId);
  if (!batch) return false;
  if (batch.status === "completed" || batch.status === "failed" || batch.status === "cancelled") {
    return false;
  }

  batch.status = "cancelled";
  batch.completedAt = Date.now();

  for (const item of batch.items) {
    if (item.status === "pending" || item.status === "queued") {
      item.status = "skipped";
      batch.skippedItems++;
    }
  }

  logger.info(`[BatchManager] Batch ${batchId} cancelled`);
  emitProgress(batchId);
  return true;
}

export function removeBatch(batchId: string): boolean {
  const batch = batches.get(batchId);
  if (!batch) return false;
  if (batch.status === "running") {
    cancelBatch(batchId);
  }
  batches.delete(batchId);
  batchCallbacks.delete(batchId);
  logger.info(`[BatchManager] Batch ${batchId} removed`);
  return true;
}

export function onBatchProgress(
  batchId: string,
  callback: (progress: BatchProgress) => void,
): () => void {
  if (!batchCallbacks.has(batchId)) {
    batchCallbacks.set(batchId, []);
  }
  const callbacks = batchCallbacks.get(batchId)!;
  callbacks.push(callback);

  return () => {
    const idx = callbacks.indexOf(callback);
    if (idx > -1) {
      callbacks.splice(idx, 1);
    }
  };
}

function emitProgress(batchId: string): void {
  const progress = getBatchProgress(batchId);
  if (!progress) return;

  const callbacks = batchCallbacks.get(batchId);
  if (callbacks) {
    for (const cb of callbacks) {
      try {
        cb(progress);
      } catch (err) {
        logger.error("[BatchManager] Progress callback error:", err);
      }
    }
  }
}

function getNextBatchToProcess(): BatchTask | undefined {
  const queuedBatches = Array.from(batches.values())
    .filter((b) => b.status === "queued")
    .sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt);

  return queuedBatches[0];
}

async function processNextBatch(): Promise<void> {
  if (isProcessing) return;

  const batch = getNextBatchToProcess();
  if (!batch) return;

  isProcessing = true;
  batch.status = "running";

  logger.info(`[BatchManager] Starting batch ${batch.id}`);
  emitProgress(batch.id);

  try {
    await processBatchItems(batch);
    batch.status = "completed";
    batch.completedAt = Date.now();
    logger.info(
      `[BatchManager] Batch ${batch.id} completed: ${batch.completedItems}/${batch.totalItems} succeeded, ${batch.failedItems} failed`,
    );
  } catch (err) {
    batch.status = "failed";
    batch.completedAt = Date.now();
    logger.error(`[BatchManager] Batch ${batch.id} failed:`, err);
  } finally {
    emitProgress(batch.id);
    isProcessing = false;
    processNextBatch();
  }
}

async function processBatchItems(batch: BatchTask): Promise<void> {
  const concurrency = Math.min(batch.concurrency, batch.items.length);
  const activePromises: Promise<void>[] = [];
  let nextIndex = 0;

  while (nextIndex < batch.items.length) {
    if (batch.status !== "running") {
      break;
    }

    while (activePromises.length < concurrency && nextIndex < batch.items.length) {
      const item = batch.items[nextIndex];
      if (item.status === "queued") {
        activePromises.push(processBatchItem(batch, item));
        batch.currentIndex = nextIndex;
      }
      nextIndex++;
    }

    if (activePromises.length === 0) break;

    const completedIdx = await Promise.race(
      activePromises.map((p, i) => p.then(() => i)),
    );
    if (completedIdx > -1 && completedIdx < activePromises.length) {
      activePromises.splice(completedIdx, 1);
    }
    emitProgress(batch.id);
  }

  await Promise.all(activePromises);
}

async function processBatchItem(batch: BatchTask, item: BatchItem): Promise<void> {
  item.status = "running";
  item.startedAt = Date.now();

  try {
    logger.debug(`[BatchManager] Processing item ${item.id}: ${item.prompt.slice(0, 50)}...`);

    item.images = [];
    item.status = "completed";
    item.completedAt = Date.now();
    batch.completedItems++;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    if (item.retries < item.maxRetries) {
      item.retries++;
      item.status = "queued";
      logger.warn(
        `[BatchManager] Item ${item.id} failed, retrying (${item.retries}/${item.maxRetries}): ${errorMsg}`,
      );
    } else {
      item.error = errorMsg;
      item.status = "failed";
      item.completedAt = Date.now();
      batch.failedItems++;
      logger.warn(`[BatchManager] Item ${item.id} failed permanently: ${errorMsg}`);
    }
  }
}

export function getBatchStats(): {
  totalBatches: number;
  runningBatches: number;
  pendingBatches: number;
  completedBatches: number;
  failedBatches: number;
  totalItems: number;
  completedItems: number;
  failedItems: number;
} {
  const allBatches = Array.from(batches.values());
  return {
    totalBatches: allBatches.length,
    runningBatches: allBatches.filter((b) => b.status === "running").length,
    pendingBatches: allBatches.filter((b) => b.status === "pending" || b.status === "queued").length,
    completedBatches: allBatches.filter((b) => b.status === "completed").length,
    failedBatches: allBatches.filter((b) => b.status === "failed").length,
    totalItems: allBatches.reduce((sum, b) => sum + b.totalItems, 0),
    completedItems: allBatches.reduce((sum, b) => sum + b.completedItems, 0),
    failedItems: allBatches.reduce((sum, b) => sum + b.failedItems, 0),
  };
}

export function clearCompletedBatches(olderThanMs?: number): number {
  let removed = 0;
  const now = Date.now();

  for (const [id, batch] of batches) {
    if (batch.status === "completed" || batch.status === "failed" || batch.status === "cancelled") {
      if (!olderThanMs || !batch.completedAt || now - batch.completedAt > olderThanMs) {
        batches.delete(id);
        batchCallbacks.delete(id);
        removed++;
      }
    }
  }

  if (removed > 0) {
    logger.info(`[BatchManager] Cleared ${removed} completed batches`);
  }

  return removed;
}

/**
 * Generation History — 生成历史记录
 *
 * 管理图像生成的历史记录，包括增删改查、搜索、统计等功能。
 */

import { logger } from "../../logger.js";

export type GenerationHistoryRecord = {
  id: string;
  prompt: string;
  enhancedPrompt?: string;
  negativePrompt?: string;
  provider: string;
  model: string;
  imageCount: number;
  size?: string;
  width?: number;
  height?: number;
  style?: string;
  sizePreset?: string;
  quality?: string;
  outputFormat?: string;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
  imageUrls: string[];
  thumbnailUrls?: string[];
  createdAt: number;
  tags?: string[];
  favorite?: boolean;
  metadata?: Record<string, unknown>;
};

export type HistoryQueryParams = {
  limit?: number;
  offset?: number;
  provider?: string;
  model?: string;
  style?: string;
  success?: boolean;
  favorite?: boolean;
  tag?: string;
  search?: string;
  startDate?: number;
  endDate?: number;
  sortBy?: "createdAt" | "durationMs" | "imageCount";
  sortOrder?: "asc" | "desc";
};

export type HistoryStats = {
  totalGenerations: number;
  totalImages: number;
  totalDurationMs: number;
  successRate: number;
  averageDurationMs: number;
  providerBreakdown: Record<string, number>;
  modelBreakdown: Record<string, number>;
  styleBreakdown: Record<string, number>;
  lastGenerationAt?: number;
};

const MAX_HISTORY_ITEMS = 1000;
const historyStore: GenerationHistoryRecord[] = [];

function generateId(): string {
  return `gen_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function addToGenerationHistory(
  record: Omit<GenerationHistoryRecord, "id" | "createdAt">,
): GenerationHistoryRecord {
  const newRecord: GenerationHistoryRecord = {
    ...record,
    id: generateId(),
    createdAt: Date.now(),
  };

  historyStore.unshift(newRecord);

  if (historyStore.length > MAX_HISTORY_ITEMS) {
    const removed = historyStore.splice(MAX_HISTORY_ITEMS);
    logger.debug(
      `[GenerationHistory] Trimmed ${removed.length} old history items (max: ${MAX_HISTORY_ITEMS})`,
    );
  }

  return newRecord;
}

export function getGenerationHistory(
  query: HistoryQueryParams = {},
): GenerationHistoryRecord[] {
  let results = [...historyStore];

  if (query.provider) {
    results = results.filter((r) => r.provider.toLowerCase() === query.provider!.toLowerCase());
  }

  if (query.model) {
    results = results.filter((r) => r.model.toLowerCase() === query.model!.toLowerCase());
  }

  if (query.style) {
    results = results.filter((r) => r.style?.toLowerCase() === query.style!.toLowerCase());
  }

  if (query.success !== undefined) {
    results = results.filter((r) => r.success === query.success);
  }

  if (query.favorite !== undefined) {
    results = results.filter((r) => r.favorite === query.favorite);
  }

  if (query.tag) {
    results = results.filter((r) => r.tags?.includes(query.tag!));
  }

  if (query.search) {
    const searchLower = query.search.toLowerCase();
    results = results.filter((r) =>
      r.prompt.toLowerCase().includes(searchLower) ||
      r.enhancedPrompt?.toLowerCase().includes(searchLower) ||
      r.tags?.some((t) => t.toLowerCase().includes(searchLower)),
    );
  }

  if (query.startDate) {
    results = results.filter((r) => r.createdAt >= query.startDate!);
  }

  if (query.endDate) {
    results = results.filter((r) => r.createdAt <= query.endDate!);
  }

  const sortBy = query.sortBy || "createdAt";
  const sortOrder = query.sortOrder || "desc";

  results.sort((a, b) => {
    const aVal = a[sortBy] as number;
    const bVal = b[sortBy] as number;
    return sortOrder === "desc" ? bVal - aVal : aVal - bVal;
  });

  const offset = query.offset || 0;
  const limit = query.limit || 50;

  return results.slice(offset, offset + limit);
}

export function getGenerationHistoryItem(id: string): GenerationHistoryRecord | undefined {
  return historyStore.find((r) => r.id === id);
}

export function updateGenerationHistoryItem(
  id: string,
  updates: Partial<GenerationHistoryRecord>,
): GenerationHistoryRecord | undefined {
  const index = historyStore.findIndex((r) => r.id === id);
  if (index === -1) return undefined;

  historyStore[index] = { ...historyStore[index], ...updates };
  return historyStore[index];
}

export function deleteGenerationHistoryItem(id: string): boolean {
  const index = historyStore.findIndex((r) => r.id === id);
  if (index === -1) return false;

  historyStore.splice(index, 1);
  return true;
}

export function clearGenerationHistory(): void {
  historyStore.length = 0;
  logger.info("[GenerationHistory] All history cleared");
}

export function toggleFavorite(id: string): boolean {
  const record = getGenerationHistoryItem(id);
  if (!record) return false;

  record.favorite = !record.favorite;
  return record.favorite;
}

export function addTags(id: string, tags: string[]): boolean {
  const record = getGenerationHistoryItem(id);
  if (!record) return false;

  if (!record.tags) {
    record.tags = [];
  }

  for (const tag of tags) {
    if (!record.tags.includes(tag)) {
      record.tags.push(tag);
    }
  }

  return true;
}

export function removeTags(id: string, tags: string[]): boolean {
  const record = getGenerationHistoryItem(id);
  if (!record || !record.tags) return false;

  record.tags = record.tags.filter((t) => !tags.includes(t));
  return true;
}

export function getHistoryStats(): HistoryStats {
  const total = historyStore.length;
  const successful = historyStore.filter((r) => r.success);
  const totalImages = historyStore.reduce((sum, r) => sum + r.imageCount, 0);
  const totalDuration = historyStore.reduce((sum, r) => sum + r.durationMs, 0);

  const providerBreakdown: Record<string, number> = {};
  const modelBreakdown: Record<string, number> = {};
  const styleBreakdown: Record<string, number> = {};

  for (const record of historyStore) {
    providerBreakdown[record.provider] = (providerBreakdown[record.provider] || 0) + 1;
    modelBreakdown[record.model] = (modelBreakdown[record.model] || 0) + 1;
    if (record.style) {
      styleBreakdown[record.style] = (styleBreakdown[record.style] || 0) + 1;
    }
  }

  return {
    totalGenerations: total,
    totalImages,
    totalDurationMs: totalDuration,
    successRate: total > 0 ? successful.length / total : 0,
    averageDurationMs: total > 0 ? totalDuration / total : 0,
    providerBreakdown,
    modelBreakdown,
    styleBreakdown,
    lastGenerationAt: historyStore.length > 0 ? historyStore[0].createdAt : undefined,
  };
}

export function searchHistoryByPrompt(
  promptQuery: string,
  limit: number = 20,
): GenerationHistoryRecord[] {
  const lower = promptQuery.toLowerCase();
  return historyStore
    .filter((r) => r.prompt.toLowerCase().includes(lower))
    .slice(0, limit);
}

export function getHistoryHistoryCount(): number {
  return historyStore.length;
}

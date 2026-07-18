/**
 * Media Store — 媒体存储
 *
 * 提供基于内存/文件系统的资产存储抽象。
 */

import { logger } from "../../logger.js";
import type { MediaAsset, MediaStoreConfig } from "./types.js";

const memoryStore: Map<string, MediaAsset> = new Map();
let currentConfig: MediaStoreConfig = {
  backend: "memory",
  maxFileSize: 100 * 1024 * 1024, // 100MB
};

export function configureStore(config: MediaStoreConfig): void {
  currentConfig = { ...config };
  logger.debug(`[MediaStore] Configured backend=${config.backend}`);
}

export function getStoreConfig(): MediaStoreConfig {
  return { ...currentConfig };
}

export function validateStoreConfig(config: MediaStoreConfig): string[] {
  const errors: string[] = [];
  if (!config.backend) {
    errors.push("backend is required");
  }
  if (
    config.backend === "filesystem" ||
    config.backend === "s3" ||
    config.backend === "cdn"
  ) {
    if (!config.rootPath && !config.baseUrl) {
      errors.push(`${config.backend} backend requires rootPath or baseUrl`);
    }
  }
  if (config.maxFileSize !== undefined && config.maxFileSize <= 0) {
    errors.push("maxFileSize must be > 0");
  }
  return errors;
}

export function saveAsset(asset: MediaAsset): MediaAsset {
  if (currentConfig.maxFileSize && asset.size > currentConfig.maxFileSize) {
    throw new Error(
      `Asset size ${asset.size} exceeds max ${currentConfig.maxFileSize}`,
    );
  }
  if (currentConfig.allowedFormats && currentConfig.allowedFormats.length > 0) {
    if (!currentConfig.allowedFormats.includes(asset.format)) {
      throw new Error(`Format ${asset.format} is not allowed`);
    }
  }
  memoryStore.set(asset.id, { ...asset });
  logger.debug(`[MediaStore] Saved asset ${asset.id}`);
  return asset;
}

export function getAsset(id: string): MediaAsset | undefined {
  return memoryStore.get(id);
}

export function listAssets(): MediaAsset[] {
  return Array.from(memoryStore.values());
}

export function deleteAsset(id: string): boolean {
  const exists = memoryStore.has(id);
  memoryStore.delete(id);
  if (exists) {
    logger.debug(`[MediaStore] Deleted asset ${id}`);
  }
  return exists;
}

export function updateAsset(
  id: string,
  updates: Partial<MediaAsset>,
): MediaAsset | undefined {
  const existing = memoryStore.get(id);
  if (!existing) return undefined;
  const updated: MediaAsset = {
    ...existing,
    ...updates,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: Date.now(),
  };
  memoryStore.set(id, updated);
  return updated;
}

export function clearStore(): void {
  memoryStore.clear();
}

export function getStoreStats(): {
  count: number;
  totalSize: number;
  byType: Record<string, { count: number; size: number }>;
} {
  let totalSize = 0;
  const byType: Record<string, { count: number; size: number }> = {};
  for (const asset of memoryStore.values()) {
    totalSize += asset.size;
    if (!byType[asset.type]) {
      byType[asset.type] = { count: 0, size: 0 };
    }
    byType[asset.type].count++;
    byType[asset.type].size += asset.size;
  }
  return {
    count: memoryStore.size,
    totalSize,
    byType,
  };
}

export function findAssetsByHash(hash: string): MediaAsset[] {
  return listAssets().filter((a) => a.hash === hash);
}

export function findAssetsByTag(tag: string): MediaAsset[] {
  return listAssets().filter((a) => a.tags?.includes(tag));
}

export function findAssetsByFormat(format: string): MediaAsset[] {
  return listAssets().filter((a) => a.format === format);
}

export function exists(id: string): boolean {
  return memoryStore.has(id);
}

export function getAssetPath(id: string): string | undefined {
  if (currentConfig.backend === "filesystem" && currentConfig.rootPath) {
    return `${currentConfig.rootPath}/${id}`;
  }
  if (currentConfig.backend === "s3" || currentConfig.backend === "cdn") {
    return currentConfig.baseUrl ? `${currentConfig.baseUrl}/${id}` : undefined;
  }
  return undefined;
}

export function getAssetUrl(id: string): string | undefined {
  if (currentConfig.backend === "s3" || currentConfig.backend === "cdn") {
    return currentConfig.baseUrl ? `${currentConfig.baseUrl}/${id}` : undefined;
  }
  const asset = getAsset(id);
  return asset?.url;
}

/**
 * Media Asset Manager — 媒体资产管理器
 *
 * 提供资产创建、校验、查询、标签管理等纯计算功能。
 */

import { logger } from "../../logger.js";
import type { MediaAsset, MediaFormat, MediaType } from "./types.js";

/** MIME 类型到媒体类型映射 */
export function detectMediaType(mimeType: string): MediaType {
  if (!mimeType) return "document";
  const lower = mimeType.toLowerCase();
  if (lower.startsWith("image/")) return "image";
  if (lower.startsWith("video/")) return "video";
  if (lower.startsWith("audio/")) return "audio";
  return "document";
}

/** MIME 类型到格式映射 */
export function detectMediaFormat(mimeType: string): MediaFormat {
  if (!mimeType) return "txt";
  const lower = mimeType.toLowerCase();
  const map: Record<string, MediaFormat> = {
    "image/jpeg": "jpeg",
    "image/jpg": "jpeg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/ogg": "ogg",
    "audio/flac": "flac",
    "application/pdf": "pdf",
    "text/plain": "txt",
  };
  return map[lower] ?? "txt";
}

/** 格式到 MIME 类型 */
export function formatToMimeType(format: MediaFormat): string {
  const map: Record<MediaFormat, string> = {
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    flac: "audio/flac",
    pdf: "application/pdf",
    txt: "text/plain",
  };
  return map[format] ?? "application/octet-stream";
}

export function generateAssetId(): string {
  return `media_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function calculateHash(buffer: Buffer): string {
  let hash = 0;
  for (let i = 0; i < buffer.length; i++) {
    const char = buffer[i];
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `sha1_${Math.abs(hash).toString(16)}`;
}

export function createAsset(params: {
  buffer?: Buffer;
  url?: string;
  fileName?: string;
  mimeType: string;
  size?: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}): MediaAsset {
  const type = detectMediaType(params.mimeType);
  const format = detectMediaFormat(params.mimeType);
  const size = params.size ?? params.buffer?.length ?? 0;
  const now = Date.now();
  const hash = params.buffer ? calculateHash(params.buffer) : undefined;

  return {
    id: generateAssetId(),
    type,
    format,
    mimeType: params.mimeType,
    size,
    fileName: params.fileName,
    url: params.url,
    buffer: params.buffer,
    width: params.width,
    height: params.height,
    durationSeconds: params.durationSeconds,
    hash,
    tags: params.tags ? [...params.tags] : undefined,
    metadata: params.metadata,
    createdAt: now,
    updatedAt: now,
  };
}

export function validateAsset(asset: Partial<MediaAsset>): string[] {
  const errors: string[] = [];
  if (!asset.id) errors.push("id is required");
  if (!asset.type) errors.push("type is required");
  if (!asset.format) errors.push("format is required");
  if (!asset.mimeType) errors.push("mimeType is required");
  if (asset.size === undefined || asset.size < 0) {
    errors.push("size must be >= 0");
  }
  if (!asset.buffer && !asset.url) {
    errors.push("asset must have buffer or url");
  }
  if (asset.createdAt === undefined || asset.createdAt <= 0) {
    errors.push("createdAt must be > 0");
  }
  return errors;
}

export function updateAsset(
  asset: MediaAsset,
  updates: Partial<MediaAsset>,
): MediaAsset {
  return {
    ...asset,
    ...updates,
    id: asset.id, // id 不可变
    createdAt: asset.createdAt, // createdAt 不可变
    updatedAt: Date.now(),
  };
}

export function addTags(asset: MediaAsset, tags: string[]): MediaAsset {
  const existing = new Set(asset.tags ?? []);
  for (const tag of tags) {
    if (tag) existing.add(tag);
  }
  return updateAsset(asset, { tags: Array.from(existing) });
}

export function removeTags(asset: MediaAsset, tags: string[]): MediaAsset {
  const removeSet = new Set(tags);
  const remaining = (asset.tags ?? []).filter((t) => !removeSet.has(t));
  return updateAsset(asset, { tags: remaining });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx++;
  }
  return `${value.toFixed(idx === 0 ? 0 : 2)} ${units[idx]}`;
}

export function getAssetSummary(asset: MediaAsset): string {
  const parts: string[] = [asset.id, asset.type, asset.format, formatFileSize(asset.size)];
  if (asset.fileName) parts.push(asset.fileName);
  if (asset.width && asset.height) {
    parts.push(`${asset.width}x${asset.height}`);
  }
  if (asset.durationSeconds) {
    parts.push(`${asset.durationSeconds.toFixed(1)}s`);
  }
  return parts.join(" | ");
}

export function isImage(asset: MediaAsset): boolean {
  return asset.type === "image";
}

export function isVideo(asset: MediaAsset): boolean {
  return asset.type === "video";
}

export function isAudio(asset: MediaAsset): boolean {
  return asset.type === "audio";
}

export function listAssetsByType(
  assets: MediaAsset[],
  type: MediaType,
): MediaAsset[] {
  return assets.filter((a) => a.type === type);
}

export function searchAssets(
  assets: MediaAsset[],
  query: {
    type?: MediaType;
    format?: MediaFormat;
    tags?: string[];
    fileNameContains?: string;
    minSize?: number;
    maxSize?: number;
  },
): MediaAsset[] {
  return assets.filter((asset) => {
    if (query.type && asset.type !== query.type) return false;
    if (query.format && asset.format !== query.format) return false;
    if (query.tags && query.tags.length > 0) {
      const assetTags = new Set(asset.tags ?? []);
      if (!query.tags.every((t) => assetTags.has(t))) return false;
    }
    if (
      query.fileNameContains &&
      !asset.fileName?.toLowerCase().includes(query.fileNameContains.toLowerCase())
    ) {
      return false;
    }
    if (query.minSize !== undefined && asset.size < query.minSize) return false;
    if (query.maxSize !== undefined && asset.size > query.maxSize) return false;
    return true;
  });
}

export function deduplicateAssets(assets: MediaAsset[]): MediaAsset[] {
  const seen = new Map<string, MediaAsset>();
  for (const asset of assets) {
    const key = asset.hash ?? asset.id;
    if (!seen.has(key)) {
      seen.set(key, asset);
    }
  }
  return Array.from(seen.values());
}

export function cloneAsset(asset: MediaAsset): MediaAsset {
  return {
    ...asset,
    id: generateAssetId(),
    buffer: asset.buffer ? Buffer.from(asset.buffer) : undefined,
    tags: asset.tags ? [...asset.tags] : undefined,
    metadata: asset.metadata ? { ...asset.metadata } : undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function logAssetCreated(asset: MediaAsset): void {
  logger.debug(
    `[AssetManager] Created asset ${asset.id} (${asset.type}/${asset.format}, ${formatFileSize(asset.size)})`,
  );
}

/**
 * Media Uploader — 媒体上传器
 *
 * 提供上传请求校验、分片计算、断点续传策略等纯计算逻辑。
 */

import { logger } from "../../logger.js";
import {
  createAsset,
  detectMediaFormat,
  detectMediaType,
} from "./asset-manager.js";
import { saveAsset } from "./media-store.js";
import type { MediaAsset, UploadRequest, UploadResult } from "./types.js";

export const MAX_UPLOAD_SIZE = 500 * 1024 * 1024; // 500MB
export const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
export const ALLOWED_MIME_TYPES: string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/flac",
  "application/pdf",
  "text/plain",
];

export function validateUploadRequest(req: UploadRequest): string[] {
  const errors: string[] = [];
  if (!req.fileName) errors.push("fileName is required");
  if (!req.buffer) errors.push("buffer is required");
  if (!req.mimeType) errors.push("mimeType is required");
  if (req.buffer && req.buffer.length === 0) {
    errors.push("buffer cannot be empty");
  }
  if (req.buffer && req.buffer.length > MAX_UPLOAD_SIZE) {
    errors.push(`buffer size exceeds max ${MAX_UPLOAD_SIZE}`);
  }
  if (req.mimeType && !ALLOWED_MIME_TYPES.includes(req.mimeType.toLowerCase())) {
    errors.push(`mimeType ${req.mimeType} is not allowed`);
  }
  return errors;
}

export function computeChunks(buffer: Buffer, chunkSize: number = DEFAULT_CHUNK_SIZE): Buffer[] {
  if (!buffer || buffer.length === 0) return [];
  if (chunkSize <= 0) return [buffer];
  const chunks: Buffer[] = [];
  for (let offset = 0; offset < buffer.length; offset += chunkSize) {
    chunks.push(buffer.subarray(offset, Math.min(offset + chunkSize, buffer.length)));
  }
  return chunks;
}

export function computeChunkCount(size: number, chunkSize: number = DEFAULT_CHUNK_SIZE): number {
  if (size <= 0) return 0;
  return Math.ceil(size / chunkSize);
}

export function sanitizeFileName(fileName: string): string {
  if (!fileName) return "unnamed";
  return fileName
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 255);
}

export function generateUploadId(): string {
  return `upload_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function upload(req: UploadRequest): Promise<UploadResult> {
  const errors = validateUploadRequest(req);
  if (errors.length > 0) {
    throw new Error(`Invalid upload request: ${errors.join("; ")}`);
  }

  const asset = createAsset({
    buffer: req.buffer,
    fileName: sanitizeFileName(req.fileName),
    mimeType: req.mimeType,
    tags: req.tags,
    metadata: req.metadata,
  });

  saveAsset(asset);
  logger.debug(
    `[Uploader] Uploaded ${asset.id} (${asset.type}/${asset.format}, ${asset.size} bytes)`,
  );

  return {
    asset,
    path: `memory://${asset.id}`,
  };
}

export async function uploadChunks(
  fileName: string,
  chunks: Buffer[],
  mimeType: string,
  tags?: string[],
): Promise<UploadResult> {
  if (chunks.length === 0) {
    throw new Error("No chunks provided");
  }
  const totalSize = chunks.reduce((acc, c) => acc + c.length, 0);
  const buffer = Buffer.concat(chunks, totalSize);
  return upload({
    fileName,
    buffer,
    mimeType,
    tags,
  });
}

export function listAllowedMimeTypes(): string[] {
  return [...ALLOWED_MIME_TYPES];
}

export function getMaxUploadSize(): number {
  return MAX_UPLOAD_SIZE;
}

export function isAllowedMimeType(mimeType: string): boolean {
  return ALLOWED_MIME_TYPES.includes(mimeType.toLowerCase());
}

export function getUploadSummary(asset: MediaAsset): string {
  const parts: string[] = [asset.id, asset.type, asset.format, `${asset.size}B`];
  if (asset.fileName) parts.push(asset.fileName);
  return parts.join(" | ");
}

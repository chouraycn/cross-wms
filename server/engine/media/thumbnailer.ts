/**
 * Media Thumbnailer — 媒体缩略图生成
 *
 * 提供缩略图尺寸/时间点计算与占位生成。
 */

import { logger } from "../../logger.js";
import type { MediaAsset, Thumbnail, ThumbnailRequest } from "./types.js";

export const DEFAULT_THUMBNAIL_WIDTH = 160;
export const DEFAULT_THUMBNAIL_HEIGHT = 120;
export const DEFAULT_THUMBNAIL_QUALITY = 80;
export const DEFAULT_THUMBNAIL_FORMAT: NonNullable<ThumbnailRequest["format"]> = "jpeg";

export function validateThumbnailRequest(req: ThumbnailRequest): string[] {
  const errors: string[] = [];
  if (!req.source) {
    errors.push("source is required");
    return errors;
  }
  if (!req.source.buffer && !req.source.url) {
    errors.push("source must have buffer or url");
  }
  if (req.width !== undefined && (req.width <= 0 || !Number.isInteger(req.width))) {
    errors.push("width must be a positive integer");
  }
  if (req.height !== undefined && (req.height <= 0 || !Number.isInteger(req.height))) {
    errors.push("height must be a positive integer");
  }
  if (req.count !== undefined && (req.count <= 0 || !Number.isInteger(req.count))) {
    errors.push("count must be a positive integer");
  }
  if (req.quality !== undefined && (req.quality < 1 || req.quality > 100)) {
    errors.push("quality must be in [1, 100]");
  }
  if (req.format && !["jpeg", "png", "webp"].includes(req.format)) {
    errors.push("format must be jpeg | png | webp");
  }
  if (
    req.timestampSeconds !== undefined &&
    (req.timestampSeconds < 0 ||
      (req.source.durationSeconds && req.timestampSeconds > req.source.durationSeconds))
  ) {
    errors.push("timestampSeconds out of range");
  }
  return errors;
}

export function computeThumbnailDimensions(
  sourceWidth?: number,
  sourceHeight?: number,
  targetWidth?: number,
  targetHeight?: number,
  maintainAspectRatio: boolean = true,
): { width: number; height: number } {
  const width = targetWidth ?? DEFAULT_THUMBNAIL_WIDTH;
  const height = targetHeight ?? DEFAULT_THUMBNAIL_HEIGHT;

  if (!maintainAspectRatio || !sourceWidth || !sourceHeight) {
    return { width, height };
  }

  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = width / height;

  if (sourceRatio > targetRatio) {
    return { width, height: Math.round(width / sourceRatio) };
  }
  return { width: Math.round(height * sourceRatio), height };
}

export function computeThumbnailTimestamps(
  durationSeconds?: number,
  count?: number,
  timestampSeconds?: number,
): number[] {
  if (timestampSeconds !== undefined) return [timestampSeconds];
  if (!durationSeconds || durationSeconds <= 0) return [0];
  const n = count ?? 1;
  if (n === 1) return [durationSeconds / 2];

  const interval = durationSeconds / n;
  const timestamps: number[] = [];
  for (let i = 0; i < n; i++) {
    timestamps.push(interval * (i + 0.5));
  }
  return timestamps;
}

export function formatToMimeType(format: "jpeg" | "png" | "webp"): string {
  switch (format) {
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    default:
      return "image/jpeg";
  }
}

export async function generateThumbnails(
  req: ThumbnailRequest,
): Promise<Thumbnail[]> {
  const errors = validateThumbnailRequest(req);
  if (errors.length > 0) {
    throw new Error(`Invalid thumbnail request: ${errors.join("; ")}`);
  }

  const format = req.format ?? DEFAULT_THUMBNAIL_FORMAT;
  const quality = req.quality ?? DEFAULT_THUMBNAIL_QUALITY;
  const dimensions = computeThumbnailDimensions(
    req.source.width,
    req.source.height,
    req.width,
    req.height,
  );
  const timestamps = computeThumbnailTimestamps(
    req.source.durationSeconds,
    req.count,
    req.timestampSeconds,
  );

  logger.debug(
    `[Thumbnailer] Generating ${timestamps.length} thumbnail(s) at ${dimensions.width}x${dimensions.height}`,
  );

  const sourceBuffer = req.source.buffer ?? Buffer.alloc(0);
  const mimeType = formatToMimeType(format);

  return timestamps.map((ts) => ({
    buffer: sourceBuffer.length > 0
      ? Buffer.from(sourceBuffer.subarray(0, Math.max(1, Math.floor(sourceBuffer.length / Math.max(1, timestamps.length)))))
      : Buffer.from([0]),
    width: dimensions.width,
    height: dimensions.height,
    mimeType,
    timestampSeconds: ts,
  }));
}

export function estimateThumbnailSize(
  width: number,
  height: number,
  format: "jpeg" | "png" | "webp" = "jpeg",
  quality: number = 80,
): number {
  // 简单估算：每像素字节数受格式和质量影响
  const pixels = width * height;
  const qualityFactor = quality / 100;
  switch (format) {
    case "jpeg":
      return Math.ceil(pixels * 0.15 * qualityFactor);
    case "png":
      return Math.ceil(pixels * 0.5);
    case "webp":
      return Math.ceil(pixels * 0.1 * qualityFactor);
    default:
      return Math.ceil(pixels * 0.2);
  }
}

export function pickBestThumbnail(
  thumbnails: Thumbnail[],
  targetTimestamp: number,
): Thumbnail | undefined {
  if (thumbnails.length === 0) return undefined;
  let best = thumbnails[0];
  let bestDiff = Math.abs((best.timestampSeconds ?? 0) - targetTimestamp);
  for (const t of thumbnails) {
    const diff = Math.abs((t.timestampSeconds ?? 0) - targetTimestamp);
    if (diff < bestDiff) {
      best = t;
      bestDiff = diff;
    }
  }
  return best;
}

export function listSupportedFormats(): Array<"jpeg" | "png" | "webp"> {
  return ["jpeg", "png", "webp"];
}

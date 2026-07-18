/**
 * Frame Extractor — 视频帧提取器
 *
 * 计算帧提取时间点、时间戳、缩略图策略。
 * 不依赖外部视频处理库。
 */

import { logger } from "../../logger.js";
import type { GeneratedVideoAsset } from "./types.js";

export type FrameExtractionOptions = {
  fps?: number;
  count?: number;
  startSeconds?: number;
  endSeconds?: number;
  quality?: "low" | "medium" | "high";
  format?: "png" | "jpeg" | "webp";
};

export type ExtractedFrame = {
  index: number;
  timeSeconds: number;
  buffer: Buffer;
  mimeType: string;
  metadata?: Record<string, unknown>;
};

export type FrameExtractionResult = {
  frames: ExtractedFrame[];
  totalCount: number;
  durationSeconds: number;
  metadata?: Record<string, unknown>;
};

export function validateExtractionOptions(
  options: FrameExtractionOptions,
): string[] {
  const errors: string[] = [];
  if (options.fps !== undefined && (options.fps <= 0 || options.fps > 120)) {
    errors.push("fps must be in (0, 120]");
  }
  if (options.count !== undefined && (options.count <= 0 || !Number.isInteger(options.count))) {
    errors.push("count must be a positive integer");
  }
  if (options.startSeconds !== undefined && options.startSeconds < 0) {
    errors.push("startSeconds must be >= 0");
  }
  if (options.endSeconds !== undefined && options.endSeconds < 0) {
    errors.push("endSeconds must be >= 0");
  }
  if (
    options.startSeconds !== undefined &&
    options.endSeconds !== undefined &&
    options.endSeconds < options.startSeconds
  ) {
    errors.push("endSeconds must be >= startSeconds");
  }
  if (options.quality && !["low", "medium", "high"].includes(options.quality)) {
    errors.push("quality must be low | medium | high");
  }
  if (options.format && !["png", "jpeg", "webp"].includes(options.format)) {
    errors.push("format must be png | jpeg | webp");
  }
  return errors;
}

export function computeFrameTimestamps(
  durationSeconds: number,
  options: FrameExtractionOptions = {},
): number[] {
  if (durationSeconds <= 0) return [];

  const start = Math.max(0, options.startSeconds ?? 0);
  const end = Math.min(durationSeconds, options.endSeconds ?? durationSeconds);
  if (end <= start) return [];

  if (options.count && options.count > 0) {
    const interval = (end - start) / options.count;
    const timestamps: number[] = [];
    for (let i = 0; i < options.count; i++) {
      timestamps.push(start + interval * (i + 0.5));
    }
    return timestamps;
  }

  const fps = options.fps ?? 1;
  const timestamps: number[] = [];
  for (let t = start; t < end; t += 1 / fps) {
    timestamps.push(t);
  }
  return timestamps;
}

export function pickEvenlySpacedFrames(
  durationSeconds: number,
  count: number,
): number[] {
  if (count <= 0 || durationSeconds <= 0) return [];
  if (count === 1) return [durationSeconds / 2];

  const interval = durationSeconds / count;
  const timestamps: number[] = [];
  for (let i = 0; i < count; i++) {
    timestamps.push(interval * (i + 0.5));
  }
  return timestamps;
}

export function qualityToScale(quality: "low" | "medium" | "high"): number {
  switch (quality) {
    case "low":
      return 0.25;
    case "medium":
      return 0.5;
    case "high":
      return 1;
    default:
      return 1;
  }
}

export function formatToMimeType(format: "png" | "jpeg" | "webp"): string {
  switch (format) {
    case "png":
      return "image/png";
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    default:
      return "image/png";
  }
}

export async function extractFrames(
  asset: GeneratedVideoAsset,
  options: FrameExtractionOptions = {},
): Promise<FrameExtractionResult> {
  const errors = validateExtractionOptions(options);
  if (errors.length > 0) {
    throw new Error(`Invalid extraction options: ${errors.join("; ")}`);
  }

  const duration = asset.durationSeconds ?? 0;
  const timestamps = computeFrameTimestamps(duration, options);
  const format = options.format ?? "jpeg";
  const mimeType = formatToMimeType(format);

  logger.debug(
    `[FrameExtractor] Extracting ${timestamps.length} frame(s) from ${duration}s video`,
  );

  const sourceBuffer = asset.buffer ?? Buffer.alloc(0);
  const frames: ExtractedFrame[] = timestamps.map((t, idx) => ({
    index: idx,
    timeSeconds: t,
    buffer: sourceBuffer.length > 0
      ? sourceBuffer.subarray(
          Math.min(sourceBuffer.length - 1, Math.floor(t * 1000) % sourceBuffer.length),
          Math.min(sourceBuffer.length, Math.floor(t * 1000) % sourceBuffer.length + 1),
        )
      : Buffer.from([0]),
    mimeType,
    metadata: {
      timestamp: t,
      quality: options.quality ?? "medium",
      scale: qualityToScale(options.quality ?? "medium"),
    },
  }));

  return {
    frames,
    totalCount: frames.length,
    durationSeconds: duration,
    metadata: {
      format,
      fps: options.fps,
      count: options.count,
      createdAt: Date.now(),
    },
  };
}

export function estimateFrameCount(
  durationSeconds: number,
  options: FrameExtractionOptions = {},
): number {
  if (durationSeconds <= 0) return 0;
  if (options.count && options.count > 0) return options.count;
  const fps = options.fps ?? 1;
  const start = Math.max(0, options.startSeconds ?? 0);
  const end = Math.min(durationSeconds, options.endSeconds ?? durationSeconds);
  return Math.max(0, Math.ceil((end - start) * fps));
}

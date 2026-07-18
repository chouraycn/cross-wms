/**
 * Media Transcoder — 媒体转码器
 *
 * 提供格式转换、编解码参数计算等纯计算逻辑。
 * 不依赖外部转码库（如 ffmpeg）。
 */

import { logger } from "../../logger.js";
import {
  detectMediaFormat,
  detectMediaType,
  formatToMimeType,
} from "./asset-manager.js";
import type { MediaFormat, MediaType, TranscodeRequest, TranscodeResult } from "./types.js";

/** 支持的转码路径（source → target） */
const TRANSCODE_MATRIX: Record<MediaType, MediaFormat[]> = {
  image: ["jpeg", "png", "webp"],
  video: ["mp4", "webm", "mov"],
  audio: ["mp3", "wav", "ogg", "flac"],
  document: ["pdf", "txt"],
};

export function isTranscodable(sourceFormat: MediaFormat, targetFormat: MediaFormat): boolean {
  const type = detectMediaType(formatToMimeType(sourceFormat));
  const allowed = TRANSCODE_MATRIX[type] ?? [];
  return allowed.includes(targetFormat);
}

export function listTargetFormats(sourceFormat: MediaFormat): MediaFormat[] {
  const type = detectMediaType(formatToMimeType(sourceFormat));
  return [...(TRANSCODE_MATRIX[type] ?? [])];
}

export function validateTranscodeRequest(req: TranscodeRequest): string[] {
  const errors: string[] = [];
  if (!req.source) {
    errors.push("source is required");
    return errors;
  }
  if (!req.source.buffer && !req.source.url) {
    errors.push("source must have buffer or url");
  }
  if (!req.targetFormat) {
    errors.push("targetFormat is required");
  }
  if (req.targetFormat && req.source.format) {
    if (!isTranscodable(req.source.format, req.targetFormat)) {
      errors.push(
        `cannot transcode ${req.source.format} to ${req.targetFormat}`,
      );
    }
  }
  if (req.options?.bitrate !== undefined && req.options.bitrate <= 0) {
    errors.push("options.bitrate must be > 0");
  }
  if (req.options?.crf !== undefined && (req.options.crf < 0 || req.options.crf > 51)) {
    errors.push("options.crf must be in [0, 51]");
  }
  if (
    req.options?.fps !== undefined &&
    (!Number.isInteger(req.options.fps) || req.options.fps < 1 || req.options.fps > 120)
  ) {
    errors.push("options.fps must be an integer in [1, 120]");
  }
  if (req.options?.preset && !["ultrafast", "fast", "medium", "slow"].includes(req.options.preset)) {
    errors.push("options.preset must be ultrafast | fast | medium | slow");
  }
  return errors;
}

export function estimateTranscodeDuration(
  sourceSize: number,
  targetFormat: MediaFormat,
  preset: "ultrafast" | "fast" | "medium" | "slow" = "medium",
): number {
  // 简单估算：每 MB 约 1s（preset 影响倍率）
  const sizeMb = sourceSize / (1024 * 1024);
  const presetMultiplier: Record<string, number> = {
    ultrafast: 0.5,
    fast: 0.8,
    medium: 1,
    slow: 1.8,
  };
  const formatMultiplier =
    targetFormat === "mp4" ? 1.2 :
    targetFormat === "webm" ? 1.5 :
    targetFormat === "flac" ? 0.7 :
    1;
  return Math.max(1, Math.ceil(sizeMb * presetMultiplier[preset] * formatMultiplier));
}

export function estimateTranscodeOutputSize(
  sourceSize: number,
  targetFormat: MediaFormat,
  bitrate?: number,
): number {
  if (bitrate) {
    // 简单按比特率估算：bitrate (bps) * 估算时长（这里假设 60s）
    return Math.ceil((bitrate * 60) / 8);
  }
  const ratio: Record<MediaFormat, number> = {
    jpeg: 0.2,
    png: 1.2,
    webp: 0.3,
    gif: 0.6,
    mp4: 0.4,
    webm: 0.35,
    mov: 0.7,
    mp3: 0.1,
    wav: 3,
    ogg: 0.15,
    flac: 0.6,
    pdf: 1,
    txt: 0.1,
  };
  return Math.ceil(sourceSize * (ratio[targetFormat] ?? 1));
}

export function resolveCodec(format: MediaFormat): string {
  const map: Record<MediaFormat, string> = {
    jpeg: "mjpeg",
    png: "png",
    webp: "libwebp",
    gif: "gif",
    mp4: "h264",
    webm: "vp9",
    mov: "h264",
    mp3: "libmp3lame",
    wav: "pcm_s16le",
    ogg: "libvorbis",
    flac: "flac",
    pdf: "pdf",
    txt: "text",
  };
  return map[format] ?? "unknown";
}

export async function transcode(req: TranscodeRequest): Promise<TranscodeResult> {
  const errors = validateTranscodeRequest(req);
  if (errors.length > 0) {
    throw new Error(`Invalid transcode request: ${errors.join("; ")}`);
  }

  const sourceBuffer = req.source.buffer ?? Buffer.alloc(0);
  const targetFormat = req.targetFormat;
  const preset = req.options?.preset ?? "medium";

  const estimatedMs = estimateTranscodeDuration(
    req.source.size,
    targetFormat,
    preset,
  ) * 1000;
  logger.debug(
    `[Transcoder] Transcoding ${req.source.format} → ${targetFormat} (estimated ${estimatedMs}ms)`,
  );

  // 模拟转码：直接拷贝 buffer 作为占位
  const buffer = sourceBuffer.length > 0
    ? Buffer.from(sourceBuffer)
    : Buffer.alloc(0);

  return {
    buffer,
    format: targetFormat,
    mimeType: formatToMimeType(targetFormat),
    size: buffer.length,
    metadata: {
      sourceFormat: req.source.format,
      targetFormat,
      codec: resolveCodec(targetFormat),
      bitrate: req.options?.bitrate,
      crf: req.options?.crf,
      preset,
      estimatedMs,
      createdAt: Date.now(),
    },
  };
}

export function getTranscodeMatrix(): Record<MediaType, MediaFormat[]> {
  return JSON.parse(JSON.stringify(TRANSCODE_MATRIX));
}

export function listCodecs(): Record<MediaFormat, string> {
  return {
    jpeg: "mjpeg",
    png: "png",
    webp: "libwebp",
    gif: "gif",
    mp4: "h264",
    webm: "vp9",
    mov: "h264",
    mp3: "libmp3lame",
    wav: "pcm_s16le",
    ogg: "libvorbis",
    flac: "flac",
    pdf: "pdf",
    txt: "text",
  };
}

/** 从 MIME 类型推断转码目标格式 */
export function detectTargetFormatFromMime(mimeType: string): MediaFormat {
  return detectMediaFormat(mimeType);
}

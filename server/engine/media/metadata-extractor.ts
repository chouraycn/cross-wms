/**
 * Media Metadata Extractor — 媒体元数据提取器
 *
 * 基于文件签名/头部字节推断元数据，不依赖外部库。
 */

import { logger } from "../../logger.js";
import {
  detectMediaFormat,
  detectMediaType,
} from "./asset-manager.js";
import type { MediaAsset, MediaFormat, MediaMetadata, MediaType } from "./types.js";

/** 文件签名 → MIME/格式映射 */
const FILE_SIGNATURES: Array<{
  offset: number;
  bytes: number[];
  mimeType: string;
  format: MediaFormat;
}> = [
  // 图片
  { offset: 0, bytes: [0xff, 0xd8, 0xff], mimeType: "image/jpeg", format: "jpeg" },
  { offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47], mimeType: "image/png", format: "png" },
  { offset: 0, bytes: [0x47, 0x49, 0x46, 0x38], mimeType: "image/gif", format: "gif" },
  { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46], mimeType: "image/webp", format: "webp" }, // 简化：RIFF 也可能是 wav/webm
  // PDF
  { offset: 0, bytes: [0x25, 0x50, 0x44, 0x46], mimeType: "application/pdf", format: "pdf" },
  // MP3 ID3
  { offset: 0, bytes: [0x49, 0x44, 0x33], mimeType: "audio/mpeg", format: "mp3" },
  // WAV RIFF + WAVE
  // OGG
  { offset: 0, bytes: [0x4f, 0x67, 0x67, 0x53], mimeType: "audio/ogg", format: "ogg" },
  // fLaC
  { offset: 0, bytes: [0x66, 0x4c, 0x61, 0x43], mimeType: "audio/flac", format: "flac" },
];

export function sniffMimeType(buffer: Buffer): string | undefined {
  if (!buffer || buffer.length === 0) return undefined;

  for (const sig of FILE_SIGNATURES) {
    if (buffer.length < sig.offset + sig.bytes.length) continue;
    let match = true;
    for (let i = 0; i < sig.bytes.length; i++) {
      if (buffer[sig.offset + i] !== sig.bytes[i]) {
        match = false;
        break;
      }
    }
    if (match) return sig.mimeType;
  }

  // MP4 ftyp box
  if (buffer.length >= 12) {
    const ftyp =
      buffer[4] === 0x66 &&
      buffer[5] === 0x74 &&
      buffer[6] === 0x79 &&
      buffer[7] === 0x70;
    if (ftyp) {
      const brand = buffer.subarray(8, 12).toString("ascii");
      if (brand.startsWith("qt")) return "video/quicktime";
      return "video/mp4";
    }
  }

  // WebM EBML
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    return "video/webm";
  }

  return undefined;
}

export function detectFormatFromBuffer(buffer: Buffer): MediaFormat | undefined {
  const mime = sniffMimeType(buffer);
  if (!mime) return undefined;
  return detectMediaFormat(mime);
}

export function detectTypeFromBuffer(buffer: Buffer): MediaType | undefined {
  const mime = sniffMimeType(buffer);
  if (!mime) return undefined;
  return detectMediaType(mime);
}

export function getFileExtension(format: MediaFormat): string {
  const map: Record<MediaFormat, string> = {
    jpeg: "jpg",
    png: "png",
    webp: "webp",
    gif: "gif",
    mp4: "mp4",
    webm: "webm",
    mov: "mov",
    mp3: "mp3",
    wav: "wav",
    ogg: "ogg",
    flac: "flac",
    pdf: "pdf",
    txt: "txt",
  };
  return map[format] ?? "bin";
}

export function extractImageDimensions(buffer: Buffer): { width?: number; height?: number } {
  if (!buffer || buffer.length < 24) return {};
  // PNG
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 &&
    buffer[2] === 0x4e && buffer[3] === 0x47
  ) {
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height };
  }
  // GIF
  if (
    buffer[0] === 0x47 && buffer[1] === 0x49 &&
    buffer[2] === 0x46 && buffer[3] === 0x38
  ) {
    const width = buffer.readUInt16LE(6);
    const height = buffer.readUInt16LE(8);
    return { width, height };
  }
  // JPEG（简化：不解析完整 SOF）
  return {};
}

export function extractMetadataFromBuffer(
  buffer: Buffer,
  fileName?: string,
): MediaMetadata {
  const mimeType = sniffMimeType(buffer) ?? "application/octet-stream";
  const type = detectMediaType(mimeType);
  const format = detectMediaFormat(mimeType);
  const dims = type === "image" ? extractImageDimensions(buffer) : {};

  return {
    type,
    format,
    mimeType,
    size: buffer.length,
    width: dims.width,
    height: dims.height,
    extra: fileName ? { fileName } : undefined,
  };
}

export function extractMetadata(asset: MediaAsset): MediaMetadata {
  const buffer = asset.buffer ?? Buffer.alloc(0);
  const base = extractMetadataFromBuffer(buffer, asset.fileName);

  return {
    ...base,
    width: asset.width ?? base.width,
    height: asset.height ?? base.height,
    durationSeconds: asset.durationSeconds,
    bitrate: asset.bitrate,
    sampleRate: asset.sampleRate,
    channels: asset.channels,
    createdAt: asset.createdAt,
    extra: {
      ...base.extra,
      ...asset.metadata,
      hash: asset.hash,
      tags: asset.tags,
    },
  };
}

export function extractBasicMetadata(
  buffer: Buffer,
  mimeType?: string,
): Partial<MediaMetadata> {
  if (!buffer || buffer.length === 0) {
    return { size: 0 };
  }
  const detected = sniffMimeType(buffer);
  const finalMime = mimeType ?? detected ?? "application/octet-stream";
  const type = detectMediaType(finalMime);
  const format = detectMediaFormat(finalMime);
  const dims = type === "image" ? extractImageDimensions(buffer) : {};

  return {
    type,
    format,
    mimeType: finalMime,
    size: buffer.length,
    width: dims.width,
    height: dims.height,
  };
}

export function compareMetadata(a: MediaMetadata, b: MediaMetadata): number {
  if (a.type !== b.type) return a.type.localeCompare(b.type);
  if (a.format !== b.format) return a.format.localeCompare(b.format);
  if (a.size !== b.size) return a.size - b.size;
  return 0;
}

export function logMetadata(metadata: MediaMetadata): void {
  logger.debug(
    `[MetadataExtractor] ${metadata.type}/${metadata.format}, size=${metadata.size}, ` +
    `${metadata.width ? `${metadata.width}x${metadata.height}` : "no-dim"}`,
  );
}

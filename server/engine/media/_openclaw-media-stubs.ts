/**
 * @deprecated This file uses legacy stub naming.
 * Future refactoring should rename to *.stub.ts convention.
 * See P3-23 in optimization plan.
 */

// Shared cross-wms stubs for openclaw media-package dependencies.
//
// Provides local adapters for helpers used by ported media/ and
// media-understanding/ files. Each helper is annotated with its openclaw
// origin so callers can trace behavior back to the source.
//
// References:
//   openclaw/packages/media-core/src/{base64,mime,constants,file-name,
//     content-length,media-source-url,inbound-path-policy}.ts
//   openclaw/src/globals.ts (logVerbose / shouldLogVerbose)
//   openclaw/packages/normalization-core/src/string-coerce.ts (normalizeNullableString)

import path from "node:path";

import { normalizeOptionalString } from "./string-helpers.js";

// ============================================================================
// openclaw/src/globals.ts — logVerbose / shouldLogVerbose
// ============================================================================

const VERBOSE_ENV_KEYS = ["CROSS_WMS_VERBOSE", "OPENCLAW_VERBOSE", "VERBOSE"];

/** Returns true when verbose logging is enabled via env flags or debug log level. */
export function shouldLogVerbose(): boolean {
  for (const key of VERBOSE_ENV_KEYS) {
    const value = process.env[key];
    if (value === "1" || value === "true" || value === "yes") {
      return true;
    }
  }
  return process.env.LOG_LEVEL === "debug";
}

/** Conditionally logs a verbose message to stderr when verbose mode is active. */
export function logVerbose(message: string): void {
  if (!shouldLogVerbose()) {
    return;
  }
  // eslint-disable-next-line no-console
  console.log(message);
}

// ============================================================================
// @cdf-know/normalization-core/string-coerce — normalizeNullableString
// (normalizeOptionalString lives in ./string-helpers.js; this companion returns null)
// ============================================================================

/** Trims string input and returns null for non-strings or empty strings. */
export function normalizeNullableString(value: unknown): string | null {
  return normalizeOptionalString(value) ?? null;
}

// ============================================================================
// @openclaw/media-core/constants — MediaKind + per-kind byte caps
// ============================================================================

/** Media families that share size-policy and MIME-classification behavior. */
export type MediaKind = "image" | "audio" | "video" | "document";

/** Default outbound image payload cap shared by media loaders and adapters. */
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
/** Default outbound audio payload cap shared by media loaders and adapters. */
export const MAX_AUDIO_BYTES = 16 * 1024 * 1024;
/** Default outbound video payload cap shared by media loaders and adapters. */
export const MAX_VIDEO_BYTES = 16 * 1024 * 1024;
/** Default outbound document payload cap shared by media loaders and adapters. */
export const MAX_DOCUMENT_BYTES = 100 * 1024 * 1024;

/** Maps a MIME type to the media family used for size limits and routing. */
export function mediaKindFromMime(mime?: string | null): MediaKind | undefined {
  if (!mime) {
    return undefined;
  }
  if (mime.startsWith("image/")) {
    return "image";
  }
  if (mime.startsWith("audio/")) {
    return "audio";
  }
  if (mime.startsWith("video/")) {
    return "video";
  }
  if (mime === "application/pdf") {
    return "document";
  }
  if (mime.startsWith("text/")) {
    return "document";
  }
  return undefined;
}

/** Returns the configured byte cap for a media kind. */
export function maxBytesForKind(kind: MediaKind): number {
  switch (kind) {
    case "image":
      return MAX_IMAGE_BYTES;
    case "audio":
      return MAX_AUDIO_BYTES;
    case "video":
      return MAX_VIDEO_BYTES;
    case "document":
      return MAX_DOCUMENT_BYTES;
  }
}

// ============================================================================
// @openclaw/media-core/mime — MIME detection and classification helpers
// ============================================================================

const EXT_BY_MIME: Record<string, string> = {
  "image/heic": ".heic",
  "image/heif": ".heif",
  "image/bmp": ".bmp",
  "image/jpg": ".jpg",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/svg+xml": ".svg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "audio/ogg": ".ogg",
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/wav": ".wav",
  "audio/wave": ".wav",
  "audio/x-wav": ".wav",
  "audio/flac": ".flac",
  "audio/aac": ".aac",
  "audio/mp4": ".m4a",
  "audio/opus": ".opus",
  "audio/webm": ".webm",
  "audio/x-m4a": ".m4a",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
  "video/x-matroska": ".mkv",
  "video/avi": ".avi",
  "application/pdf": ".pdf",
};

const MIME_BY_EXT: Record<string, string> = {
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".bmp": "image/bmp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".oga": "audio/ogg",
  ".ogg": "audio/ogg",
  ".opus": "audio/opus",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
  ".m4a": "audio/mp4",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".avi": "video/avi",
  ".pdf": "application/pdf",
};

const AUDIO_EXTS = new Set([
  ".oga",
  ".ogg",
  ".opus",
  ".mp3",
  ".wav",
  ".flac",
  ".aac",
  ".m4a",
]);

/** Returns the lowercase file extension (including the leading dot) for a path or URL. */
export function getFileExtension(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  // Strip query/fragment before extracting extension so URL inputs match path inputs.
  const cleaned = value.split("?")[0]?.split("#")[0];
  if (!cleaned) {
    return undefined;
  }
  const base = path.win32.basename(path.posix.basename(cleaned));
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) {
    return undefined;
  }
  return base.slice(dot).toLowerCase();
}

/** Returns a normalized lowercase MIME type for known inputs, or undefined. */
export function normalizeMimeType(mime?: string | null): string | undefined {
  const normalized = mime?.trim().toLowerCase();
  return normalized || undefined;
}

/** Returns the preferred file extension for a MIME type, or undefined. */
export function extensionForMime(mime?: string | null): string | undefined {
  const normalized = normalizeMimeType(mime);
  if (!normalized) {
    return undefined;
  }
  return EXT_BY_MIME[normalized];
}

/** Returns the canonical MIME type for a file path based on its extension. */
export function mimeTypeFromFilePath(filePath?: string | null): string | undefined {
  const ext = getFileExtension(filePath);
  if (!ext) {
    return undefined;
  }
  return MIME_BY_EXT[ext];
}

/** Maps a MIME type to a media kind using the shared classifier. */
export function kindFromMime(mime?: string | null): MediaKind | undefined {
  return mediaKindFromMime(mime);
}

/** Returns true when the file path or URL points at an audio extension. */
export function isAudioFileName(value?: string | null): boolean {
  const ext = getFileExtension(value);
  return ext ? AUDIO_EXTS.has(ext) : false;
}

// ============================================================================
// @openclaw/media-core/file-name — POSIX/Windows-agnostic path helpers
// ============================================================================

/** Returns the basename of a POSIX or Windows path without favoring either separator. */
export function basenameFromAnyPath(value: string): string {
  return path.win32.basename(path.posix.basename(value));
}

/** Returns the extension (with leading dot) of a POSIX or Windows path. */
export function extnameFromAnyPath(value: string): string {
  const posixExt = path.posix.extname(value);
  if (posixExt) {
    return posixExt;
  }
  return path.win32.extname(value);
}

/** Returns the filename without extension for a POSIX or Windows path. */
export function nameFromAnyPath(value: string): string {
  const base = basenameFromAnyPath(value);
  const ext = extnameFromAnyPath(value);
  return ext ? base.slice(0, base.length - ext.length) : base;
}

// ============================================================================
// @openclaw/media-core/base64 — base64 canonicalization and size estimation
// ============================================================================

/** Strips whitespace and URL-safe characters so the result can be decoded by Buffer. */
export function canonicalizeBase64(value: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.replace(/\s+/g, "");
  if (!trimmed) {
    return undefined;
  }
  const normalized = trimmed.replace(/-/g, "+").replace(/_/g, "/");
  // Pad to a multiple of 4 so Buffer.from(..., "base64") does not silently truncate.
  const pad = normalized.length % 4;
  return pad ? normalized + "=".repeat(4 - pad) : normalized;
}

/** Estimates the decoded byte count for a base64 string without decoding. */
export function estimateBase64DecodedBytes(value: string): number {
  const trimmed = value.replace(/=+$/, "").replace(/\s+/g, "");
  return Math.floor(trimmed.length * 3) / 4;
}

// ============================================================================
// @openclaw/media-core/content-length — Content-Length parsing
// ============================================================================

/** Parses a Content-Length header value into a finite positive integer. */
export function parseMediaContentLength(value?: string | null): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const trimmed = String(value).trim();
  if (!/^\d+$/.test(trimmed)) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

// ============================================================================
// @openclaw/media-core/media-source-url — remote/data URL classification
// ============================================================================

/** Returns true when the source is a remote (http/https/data URL) that cannot be a local path. */
export function isPassThroughRemoteMediaSource(source: string): boolean {
  const trimmed = source.trim().toLowerCase();
  return (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("ws://") ||
    trimmed.startsWith("wss://")
  );
}

// ============================================================================
// @openclaw/media-core/inbound-path-policy — path allowlist checks
// ============================================================================

import { isPathInside } from "../infra/path-guards.js";

/** Returns true when a file path is contained by at least one of the supplied roots. */
export function isInboundPathAllowed(params: {
  filePath: string;
  roots: readonly string[];
}): boolean {
  const { filePath, roots } = params;
  if (!filePath || !roots || roots.length === 0) {
    return false;
  }
  for (const root of roots) {
    if (!root) {
      continue;
    }
    if (isPathInside(filePath, root)) {
      return true;
    }
  }
  return false;
}

/** Merges additional roots into a base list, deduplicating entries. */
export function mergeInboundPathRoots(
  base: readonly string[],
  additional?: readonly string[],
): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const root of [...base, ...(additional ?? [])]) {
    if (!root || seen.has(root)) {
      continue;
    }
    seen.add(root);
    merged.push(root);
  }
  return merged;
}

// ============================================================================
// @openclaw/media-core/mime — detectMime (magic-byte sniff)
// ============================================================================

const SNIFF_SIGNATURES: Array<{
  offset: number;
  bytes: number[];
  mime: string;
}> = [
  { offset: 0, bytes: [0xff, 0xd8, 0xff], mime: "image/jpeg" },
  { offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47], mime: "image/png" },
  { offset: 0, bytes: [0x47, 0x49, 0x46, 0x38], mime: "image/gif" },
  { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46], mime: "image/webp" },
  { offset: 0, bytes: [0x25, 0x50, 0x44, 0x46], mime: "application/pdf" },
  { offset: 0, bytes: [0x49, 0x44, 0x33], mime: "audio/mpeg" },
  { offset: 0, bytes: [0x4f, 0x67, 0x67, 0x53], mime: "audio/ogg" },
  { offset: 0, bytes: [0x66, 0x4c, 0x61, 0x43], mime: "audio/flac" },
];

/** Detects a MIME type from the leading bytes of a buffer; returns undefined when unknown. */
export async function detectMime(params: {
  buffer: Buffer;
}): Promise<string | undefined> {
  const { buffer } = params;
  if (!buffer || buffer.length === 0) {
    return undefined;
  }
  for (const sig of SNIFF_SIGNATURES) {
    if (buffer.length < sig.offset + sig.bytes.length) {
      continue;
    }
    let match = true;
    for (let i = 0; i < sig.bytes.length; i += 1) {
      if (buffer[sig.offset + i] !== sig.bytes[i]) {
        match = false;
        break;
      }
    }
    if (match) {
      return sig.mime;
    }
  }
  // MP4 ftyp box
  if (buffer.length >= 12) {
    const isFtyp =
      buffer[4] === 0x66 &&
      buffer[5] === 0x74 &&
      buffer[6] === 0x79 &&
      buffer[7] === 0x70;
    if (isFtyp) {
      const brand = buffer.subarray(8, 12).toString("ascii");
      if (brand.startsWith("qt")) {
        return "video/quicktime";
      }
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

// ============================================================================
// @openclaw/media-core/read-response-with-limit — bounded response readers
// // 复用 cross-wms 已有的真实实现模式：通过 ReadableStream 读取 Response body，
// // 在达到字节上限时提前停止，避免下载超大响应体。
// ============================================================================

/** 默认最大读取字节数（1 MiB） */
const DEFAULT_RESPONSE_READ_LIMIT = 1024 * 1024;

/**
 * 读取 Response body 的文本片段，限制最大字节数。
 * 移植自 openclaw/packages/media-core/src/read-response-with-limit.ts。
 */
export async function readResponseTextSnippet(
  response: Response,
  maxBytes?: number,
): Promise<string> {
  const buffer = await readResponseWithLimit(response, maxBytes);
  return buffer.toString("utf-8");
}

/**
 * 读取 Response body 到 Buffer，限制最大字节数。
 * 移植自 openclaw/packages/media-core/src/read-response-with-limit.ts。
 *
 * 实现：通过 response.body（ReadableStream）逐块读取，累计字节数超过上限时
 * 提前取消流。对于没有 body 的响应（如 204），返回空 Buffer。
 */
export async function readResponseWithLimit(
  response: Response,
  maxBytes?: number,
): Promise<Buffer> {
  const limit =
    typeof maxBytes === "number" && maxBytes > 0
      ? Math.floor(maxBytes)
      : DEFAULT_RESPONSE_READ_LIMIT;

  if (!response.body) {
    return Buffer.alloc(0);
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      const remaining = limit - totalBytes;
      if (remaining <= 0) {
        break;
      }
      if (chunk.length > remaining) {
        chunks.push(chunk.subarray(0, remaining));
        totalBytes = limit;
        break;
      }
      chunks.push(chunk);
      totalBytes += chunk.length;
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // 忽略释放锁错误
    }
  }

  return chunks.length === 0 ? Buffer.alloc(0) : Buffer.concat(chunks, totalBytes);
}

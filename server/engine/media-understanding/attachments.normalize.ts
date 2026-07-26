// Attachment normalization converts message context media fields into typed
// attachment records and classifies media kind from MIME or filename.
// Ported from openclaw/src/media-understanding/attachments.normalize.ts.
//
// Dependency adjustments:
//   - @openclaw/media-core/mime getFileExtension, isAudioFileName, kindFromMime
//     → ../media/_openclaw-media-stubs.js (already re-exports the helpers)
//   - @openclaw/normalization-core/string-coerce normalizeOptionalString
//     → ../media/string-helpers.js (cross-wms port of the helper)
//   - ../auto-reply/templating.js MsgContext
//     → cross-wms 的 auto-reply 模块尚未移植。这里按 openclaw 源定义复制
//       normalizeAttachments 访问的最小 MsgContext 字段子集。这与
//       server/engine/channels/conversation-label.ts 中 MsgContext 的降级策略一致。
//   - ../infra/local-file-access.js assertNoWindowsNetworkPath, safeFileURLToPath
//     → available in cross-wms at the same relative path. cross-wms's
//       assertNoWindowsNetworkPath takes only the path argument (no label),
//       so the ported call site drops the second arg.
//   - ./types.js MediaAttachment
//     → cross-wms types.ts does not yet export MediaAttachment. Define it
//       locally here and re-export so attachments.select.ts can consume it
//       without modifying the existing types.ts.
import {
  getFileExtension,
  isAudioFileName,
  kindFromMime,
} from "../media/_openclaw-media-stubs.js";
import { normalizeOptionalString } from "../media/string-helpers.js";
import {
  assertNoWindowsNetworkPath,
  safeFileURLToPath,
} from "../infra/local-file-access.js";

/** Media attachment passed to understanding providers (ported from openclaw types.ts). */
export type MediaAttachment = {
  path?: string;
  url?: string;
  mime?: string;
  index: number;
  alreadyTranscribed?: boolean;
};

/**
 * 入站消息上下文（降级占位）。
 *
 * openclaw 中 MsgContext 包含 Body/From/ChatType 等大量字段，这里仅保留
 * normalizeAttachments 访问的 media 字段子集，调用方传入的完整对象可通过
 * 结构子集化赋值给此类型。
 */
export type MsgContext = {
  MediaPaths?: readonly string[];
  MediaUrls?: readonly string[];
  MediaTypes?: readonly string[];
  MediaTranscribedIndexes?: readonly number[];
  MediaPath?: string;
  MediaUrl?: string;
  MediaType?: string;
  SkipStickerMediaUnderstanding?: boolean;
};

/** Normalizes a local attachment path while rejecting remote file URLs and Windows UNC paths. */
export function normalizeAttachmentPath(raw?: string | null): string | undefined {
  const value = normalizeOptionalString(raw);
  if (!value) {
    return undefined;
  }
  if (value.startsWith("file://")) {
    try {
      return safeFileURLToPath(value);
    } catch {
      return undefined;
    }
  }
  try {
    assertNoWindowsNetworkPath(value);
  } catch {
    return undefined;
  }
  return value;
}

/** Flattens legacy single-value and array media fields into indexed attachment records. */
export function normalizeAttachments(ctx: MsgContext): MediaAttachment[] {
  const pathsFromArray = Array.isArray(ctx.MediaPaths) ? ctx.MediaPaths : undefined;
  const urlsFromArray = Array.isArray(ctx.MediaUrls) ? ctx.MediaUrls : undefined;
  const typesFromArray = Array.isArray(ctx.MediaTypes) ? ctx.MediaTypes : undefined;
  const transcribedIndexes = new Set(
    Array.isArray(ctx.MediaTranscribedIndexes)
      ? ctx.MediaTranscribedIndexes.filter((index) => Number.isInteger(index) && index >= 0)
      : [],
  );
  const resolveMime = (count: number, index: number) => {
    const typeHint = normalizeOptionalString(typesFromArray?.[index]);
    if (typeHint) {
      return typeHint;
    }
    return count === 1 ? ctx.MediaType : undefined;
  };

  if (pathsFromArray && pathsFromArray.length > 0) {
    // Array fields are authoritative for multi-attachment messages; the legacy
    // single URL remains a per-item fallback for older channel payloads.
    const count = pathsFromArray.length;
    const urls = urlsFromArray && urlsFromArray.length > 0 ? urlsFromArray : undefined;
    return pathsFromArray
      .map((value, index) => ({
        path: normalizeOptionalString(value),
        url: urls?.[index] ?? ctx.MediaUrl,
        mime: resolveMime(count, index),
        index,
        alreadyTranscribed: transcribedIndexes.has(index),
      }))
      .filter((entry) => Boolean(entry.path ?? normalizeOptionalString(entry.url)));
  }

  if (urlsFromArray && urlsFromArray.length > 0) {
    const count = urlsFromArray.length;
    return urlsFromArray
      .map((value, index) => ({
        path: undefined,
        url: normalizeOptionalString(value),
        mime: resolveMime(count, index),
        index,
        alreadyTranscribed: transcribedIndexes.has(index),
      }))
      .filter((entry) => Boolean(entry.url));
  }

  const pathValue = normalizeOptionalString(ctx.MediaPath);
  const url = normalizeOptionalString(ctx.MediaUrl);
  if (!pathValue && !url) {
    return [];
  }
  return [
    {
      path: pathValue || undefined,
      url: url || undefined,
      mime: ctx.MediaType,
      index: 0,
      alreadyTranscribed: transcribedIndexes.has(0),
    },
  ];
}

/** Classifies an attachment by MIME first, then by filename/URL extension fallback. */
export function resolveAttachmentKind(
  attachment: MediaAttachment,
): "image" | "audio" | "video" | "document" | "unknown" {
  const kind = kindFromMime(attachment.mime);
  if (kind === "image" || kind === "audio" || kind === "video") {
    return kind;
  }

  const ext = getFileExtension(attachment.path ?? attachment.url);
  if (!ext) {
    return "unknown";
  }
  if ([".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"].includes(ext)) {
    return "video";
  }
  if (isAudioFileName(attachment.path ?? attachment.url)) {
    return "audio";
  }
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff", ".tif"].includes(ext)) {
    return "image";
  }
  return "unknown";
}

/** Returns true when the attachment is classified as video media. */
export function isVideoAttachment(attachment: MediaAttachment): boolean {
  return resolveAttachmentKind(attachment) === "video";
}

/** Returns true when the attachment is classified as audio media. */
export function isAudioAttachment(attachment: MediaAttachment): boolean {
  return resolveAttachmentKind(attachment) === "audio";
}

/** Returns true when the attachment is classified as image media. */
export function isImageAttachment(attachment: MediaAttachment): boolean {
  return resolveAttachmentKind(attachment) === "image";
}

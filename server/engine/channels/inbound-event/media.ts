import { logger } from "../../../logger.js";
import type { InboundEventMedia, InboundEventContext } from "./types.js";

export interface MediaProcessingOptions {
  maxFileSize?: number;
  allowedMimeTypes?: string[];
  autoDownload?: boolean;
  generateThumbnails?: boolean;
}

const defaultOptions: Required<MediaProcessingOptions> = {
  maxFileSize: 50 * 1024 * 1024,
  allowedMimeTypes: [],
  autoDownload: false,
  generateThumbnails: false,
};

const mediaCache = new Map<string, InboundEventMedia>();

export function processMediaAttachments(
  event: InboundEventContext,
  options: MediaProcessingOptions = {}
): InboundEventMedia[] {
  const opts = { ...defaultOptions, ...options };
  const media: InboundEventMedia[] = [];

  if (event.attachments) {
    for (const attachment of event.attachments) {
      const processed = processSingleAttachment(attachment, opts);
      if (processed) {
        media.push(processed);
        mediaCache.set(`${event.eventId}-${attachment.id}`, processed);
      }
    }
  }

  if (event.media) {
    for (const m of event.media) {
      if (validateMedia(m, opts)) {
        media.push(m);
      }
    }
  }

  logger.debug(
    `[InboundEvent:Media] Processed ${media.length} media items for ${event.eventId}`
  );

  return media;
}

function processSingleAttachment(
  attachment: { mimeType: string; size?: number; name: string; url?: string },
  opts: Required<MediaProcessingOptions>
): InboundEventMedia | null {
  if (opts.maxFileSize && attachment.size && attachment.size > opts.maxFileSize) {
    logger.warn(`[InboundEvent:Media] File too large: ${attachment.name}`);
    return null;
  }

  if (opts.allowedMimeTypes.length > 0) {
    const mimeType = attachment.mimeType.toLowerCase();
    const allowed = opts.allowedMimeTypes.some(
      (t) => mimeType.startsWith(t.toLowerCase()) || mimeType === t.toLowerCase()
    );
    if (!allowed) {
      logger.warn(`[InboundEvent:Media] MIME type not allowed: ${attachment.mimeType}`);
      return null;
    }
  }

  const type = detectMediaType(attachment.mimeType);

  return {
    type,
    url: attachment.url,
    mimeType: attachment.mimeType,
    size: attachment.size,
    filename: attachment.name,
  };
}

function detectMediaType(mimeType: string): InboundEventMedia["type"] {
  const type = mimeType.toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  return "file";
}

function validateMedia(
  media: InboundEventMedia,
  opts: Required<MediaProcessingOptions>
): boolean {
  if (opts.maxFileSize && media.size && media.size > opts.maxFileSize) {
    return false;
  }
  if (opts.allowedMimeTypes.length > 0 && media.mimeType) {
    const mimeType = media.mimeType.toLowerCase();
    return opts.allowedMimeTypes.some(
      (t) => mimeType.startsWith(t.toLowerCase()) || mimeType === t.toLowerCase()
    );
  }
  return true;
}

export function extractMediaText(media: InboundEventMedia): string | null {
  if (media.type === "file" && media.filename) {
    return media.filename;
  }
  return null;
}

export function getMediaByEventId(eventId: string): InboundEventMedia[] {
  const results: InboundEventMedia[] = [];
  for (const [key, media] of mediaCache) {
    if (key.startsWith(`${eventId}-`)) {
      results.push(media);
    }
  }
  return results;
}

export function clearMediaCache(): void {
  mediaCache.clear();
}

export function getMediaTypeCount(media: InboundEventMedia[]): {
  images: number;
  videos: number;
  audio: number;
  files: number;
} {
  return {
    images: media.filter((m) => m.type === "image").length,
    videos: media.filter((m) => m.type === "video").length,
    audio: media.filter((m) => m.type === "audio").length,
    files: media.filter((m) => m.type === "file").length,
  };
}

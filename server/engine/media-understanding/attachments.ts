import type { MediaAttachment, MediaUnderstandingCapability } from "./types.js";

export type AttachmentKind = "image" | "audio" | "video" | "document" | "unknown";

export function resolveAttachmentKind(attachment: MediaAttachment): AttachmentKind {
  const mime = attachment.mime?.trim().toLowerCase();
  if (!mime) {
    return "unknown";
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
  if (
    mime.startsWith("text/") ||
    mime === "application/pdf" ||
    mime.startsWith("application/") && mime.endsWith("+json") ||
    mime.startsWith("application/") && mime.endsWith("+xml")
  ) {
    return "document";
  }
  return "unknown";
}

export function filterAttachmentsByCapability(
  attachments: MediaAttachment[],
  capability: MediaUnderstandingCapability,
): MediaAttachment[] {
  return attachments.filter((attachment) => {
    const kind = resolveAttachmentKind(attachment);
    return kind === capability;
  });
}

// ============================================================================
// Kind predicate helpers (merged from openclaw/src/media-understanding/attachments.normalize.ts)
// ============================================================================

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

/** Returns true when the attachment is classified as document media. */
export function isDocumentAttachment(attachment: MediaAttachment): boolean {
  return resolveAttachmentKind(attachment) === "document";
}

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

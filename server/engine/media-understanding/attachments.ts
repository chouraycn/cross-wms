// Public attachment facade for normalization and selection helpers.
// Ported from openclaw/src/media-understanding/attachments.ts.
//
// Note: openclaw source also re-exports MediaAttachmentCache and
// MediaAttachmentCacheOptions from ./attachments.cache.js. cross-wms has not
// ported attachments.cache.ts because it depends on ../media/fetch.js and
// ../media/local-roots.js (both unported, deep filesystem/network stacks).
// The cache re-export is intentionally omitted; it can be added back when
// attachments.cache.ts is ported.
export {
  isAudioAttachment,
  isImageAttachment,
  isVideoAttachment,
  normalizeAttachments,
  normalizeAttachmentPath,
  resolveAttachmentKind,
} from "./attachments.normalize.js";
export { selectAttachments } from "./attachments.select.js";

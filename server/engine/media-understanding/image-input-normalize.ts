// Image input normalization converts HEIC/HEIF payloads through the shared
// input-file media path before provider execution.
// Ported from openclaw/src/media-understanding/image-input-normalize.ts.
// Simplified for cross-wms: removed dependency on ../media/input-files.js,
// provides basic HEIC detection and placeholder for conversion.
import { normalizeMimeType } from "../media/_openclaw-media-stubs.js";
import { DEFAULT_MAX_BYTES } from "./defaults.constants.js";

const HEIC_MIME_RE = /^image\/hei[cf]$/i;
const HEIC_EXT_RE = /\.(heic|heif)$/i;

function isHeicInput(params: { mime?: string; fileName?: string }): boolean {
  const mime = normalizeMimeType(params.mime);
  if (mime && HEIC_MIME_RE.test(mime)) {
    return true;
  }
  const fileName = params.fileName?.trim();
  return Boolean(fileName && HEIC_EXT_RE.test(fileName));
}

/** Normalizes image bytes before provider execution. In cross-wms, this detects
 *  HEIC/HEIF inputs and returns them as-is (conversion would require a HEIC
 *  decoder dependency not yet ported).
 */
export async function normalizeImageDescriptionInput(params: {
  buffer: Buffer;
  fileName?: string;
  mime?: string;
  maxBytes?: number;
}): Promise<{ buffer: Buffer; mime?: string }> {
  if (!isHeicInput(params)) {
    return { buffer: params.buffer, mime: params.mime };
  }
  // Cross-wms note: full HEIC-to-JPEG conversion depends on the media/input-files
  // module which is not yet ported. For now, pass HEIC inputs through unchanged;
  // providers that accept HEIC natively will handle them directly.
  return { buffer: params.buffer, mime: params.mime ?? "image/heic" };
}

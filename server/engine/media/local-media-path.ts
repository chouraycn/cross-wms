// Resolves a media source to a local path when it is not a remote or data URL.
// Ported from openclaw/src/media/local-media-path.ts.
//
// Dependency adjustments:
//   - @openclaw/media-core/media-source-url isPassThroughRemoteMediaSource
//     → ./_openclaw-media-stubs.js (already re-exports the helper)
//   - ../infra/local-file-access.js safeFileURLToPath
//     → available in cross-wms at the same relative path
//   - ../utils.js resolveUserPath
//     → cross-wms utils.js not ported; resolveUserPath is available in
//       ../infra/_fs-safe-stubs.js (process.env-aware ~ expansion + path.resolve)
import path from "node:path";
import { isPassThroughRemoteMediaSource } from "./_openclaw-media-stubs.js";
import { safeFileURLToPath } from "../infra/local-file-access.js";
import { resolveUserPath } from "../infra/_fs-safe-stubs.js";

const DATA_URL_RE = /^data:/i;
const WINDOWS_DRIVE_RE = /^[A-Za-z]:[\\/]/;

/** Resolves a media source to a local path when it is not a remote or data URL. */
export function resolveLocalMediaPath(source: string): string | undefined {
  const trimmed = source.trim();
  if (!trimmed || isPassThroughRemoteMediaSource(trimmed) || DATA_URL_RE.test(trimmed)) {
    return undefined;
  }
  if (trimmed.startsWith("file://")) {
    try {
      return safeFileURLToPath(trimmed);
    } catch {
      return undefined;
    }
  }
  if (trimmed.startsWith("~")) {
    return resolveUserPath(trimmed);
  }
  if (path.isAbsolute(trimmed) || WINDOWS_DRIVE_RE.test(trimmed)) {
    return path.resolve(trimmed);
  }
  return undefined;
}

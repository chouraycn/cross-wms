/**
 * 移植自 openclaw/src/agents/sessions/source-info.ts
 *
 * Source metadata helpers for session resources.
 * Tracks where prompts, skills, and extension-provided assets came from.
 */

/** The scope of a source file. */
export type SourceScope = "user" | "project" | "temporary";

/** The origin of a source file. */
export type SourceOrigin = "package" | "top-level";

/** Source metadata for a session resource. */
export interface SourceInfo {
  path: string;
  source: string;
  scope: SourceScope;
  origin: SourceOrigin;
  baseDir?: string;
}

/** Create source info from path metadata (simplified in cross-wms). */
export function createSourceInfo(
  path: string,
  metadata: { source: string; scope: SourceScope; origin: SourceOrigin; baseDir?: string },
): SourceInfo {
  return {
    path,
    source: metadata.source,
    scope: metadata.scope,
    origin: metadata.origin,
    baseDir: metadata.baseDir,
  };
}

/** Build source metadata for generated or synthetic session entries. */
export function createSyntheticSourceInfo(
  path: string,
  options: {
    source: string;
    scope?: SourceScope;
    origin?: SourceOrigin;
    baseDir?: string;
  },
): SourceInfo {
  return {
    path,
    source: options.source,
    scope: options.scope ?? "temporary",
    origin: options.origin ?? "top-level",
    baseDir: options.baseDir,
  };
}

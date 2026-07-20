/**
 * Loads bundled, manifest, and discovered model catalog entries.
 * Ported from openclaw/src/agents/model-catalog.ts
 * Simplified: model catalog loading replaced with empty defaults.
 */

export { findModelCatalogEntry, findModelInCatalog, modelSupportsInput } from "./model-catalog-lookup.js";
export type { ModelCatalogEntry, ModelInputType } from "./model-catalog.types.js";

let modelCatalogPromise: Promise<unknown[]> | null = null;

export function resetModelCatalogCache(): void {
  modelCatalogPromise = null;
}

export function resetModelCatalogCacheForTest(): void {
  modelCatalogPromise = null;
}

export function setModelCatalogImportForTest(_loader?: unknown): void {
  // No-op in simplified port.
}

export function loadManifestModelCatalog(_params: {
  config: unknown;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
  fallbackToMetadataScan?: boolean;
  metadataSnapshot?: unknown;
}): unknown[] {
  return [];
}

export async function loadModelCatalog(_params?: {
  config?: unknown;
  useCache?: boolean;
  cacheOnly?: boolean;
  readOnly?: boolean;
  metadataSnapshot?: unknown;
}): Promise<unknown[]> {
  return [];
}

export function modelSupportsVision(_entry: unknown): boolean {
  return false;
}

export function modelSupportsDocument(_entry: unknown): boolean {
  return false;
}

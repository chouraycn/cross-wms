/**
 * Loads bundled, manifest, and discovered model catalog entries.
 * Ported from openclaw/src/agents/model-catalog.ts
 * Simplified: model catalog loading replaced with empty defaults.
 */

export { findModelCatalogEntry, findModelInCatalog, modelSupportsInput } from "./model-catalog-lookup.js";
export type { ModelCatalogEntry, ModelInputType } from "./model-catalog.types.js";

let modelCatalogPromise: Promise<any[]> | null = null;

export function resetModelCatalogCache(): void {
  modelCatalogPromise = null;
}

export function resetModelCatalogCacheForTest(): void {
  modelCatalogPromise = null;
}

export function setModelCatalogImportForTest(_loader?: any): void {
  // No-op in simplified port.
}

export function loadManifestModelCatalog(_params: {
  config: any;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
  fallbackToMetadataScan?: boolean;
  metadataSnapshot?: any;
}): any[] {
  return [];
}

export async function loadModelCatalog(_params?: {
  config?: any;
  useCache?: boolean;
  cacheOnly?: boolean;
  readOnly?: boolean;
  metadataSnapshot?: any;
}): Promise<any[]> {
  return [];
}

export function modelSupportsVision(_entry: any): boolean {
  return false;
}

export function modelSupportsDocument(_entry: any): boolean {
  return false;
}

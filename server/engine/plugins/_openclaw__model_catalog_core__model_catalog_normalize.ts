import type { ModelCatalog } from './_openclaw__model_catalog_core__model_catalog_types.js';
import { normalizeProviderId } from './_openclaw__model_catalog_core__provider_id.js';
import { buildModelCatalogMergeKey } from './_openclaw__model_catalog_core__model_catalog_refs.js';

export function normalizeModelCatalog(catalog: unknown): ModelCatalog {
  if (!Array.isArray(catalog)) return [];
  const seen = new Set<string>();
  return catalog
    .filter(item => item && typeof item === 'object')
    .map(item => ({
      providerId: normalizeProviderId((item as any).providerId ?? ''),
      modelId: String((item as any).modelId ?? '').trim(),
      modelName: String((item as any).modelName ?? '').trim(),
      aliases: (item as any).aliases
        ? Array.isArray((item as any).aliases)
          ? (item as any).aliases.map(String).filter(Boolean)
          : undefined
        : undefined,
    }))
    .filter(entry => entry.providerId && entry.modelId)
    .filter(entry => {
      const key = buildModelCatalogMergeKey(entry.providerId, entry.modelId);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

import { normalizeProviderId } from './_openclaw__model_catalog_core__provider_id.js';

export function buildModelCatalogMergeKey(providerId: string, modelId: string): string {
  return `${normalizeProviderId(providerId)}:${modelId}`;
}

export function normalizeModelCatalogProviderId(providerId: string): string {
  return normalizeProviderId(providerId);
}

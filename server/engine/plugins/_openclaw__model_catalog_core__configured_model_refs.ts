import type { OpenClawConfig } from './_openclaw__model_catalog_core__model_catalog_types.js';

export interface ConfiguredModelRef {
  providerId: string;
  modelId: string;
}

export function collectConfiguredModelRefs(config: OpenClawConfig): ConfiguredModelRef[] {
  return [];
}

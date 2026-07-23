import type { OpenClawConfig } from './_openclaw__model_catalog_core__model_catalog_types.js';

export interface ConfiguredModelRef {
  path: string;
  value: string;
  providerId: string;
  modelId: string;
}

export function collectConfiguredModelRefs(config: OpenClawConfig): ConfiguredModelRef[] {
  return [];
}

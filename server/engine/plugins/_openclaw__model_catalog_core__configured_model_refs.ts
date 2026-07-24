import type { OpenClawConfig } from '../config/types/openclaw.js';

export interface ConfiguredModelRef {
  path: string;
  value: string;
  providerId: string;
  modelId: string;
}

export function collectConfiguredModelRefs(config: OpenClawConfig): ConfiguredModelRef[] {
  return [];
}

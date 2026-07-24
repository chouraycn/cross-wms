// 移植自 openclaw/src/config/types.models.ts

export type ModelApi = unknown;
export type SupportedThinkingFormat = unknown;
export type ModelCompatConfig = unknown;
export type ModelImageInputConfig = unknown;
export type ModelMediaInputConfig = unknown;
export type ModelProviderAuthMode = unknown;
export type ModelProviderLocalServiceConfig = unknown;
export type ModelDefinitionConfig = {
  id: string;
  [key: string]: unknown;
};
export type ModelProviderConfig = {
  baseUrl?: string;
  apiKey?: unknown;
  auth?: ModelProviderAuthMode;
  api?: ModelApi;
  contextWindow?: number;
  contextTokens?: number;
  maxTokens?: number;
  timeoutSeconds?: number;
  region?: string;
  params?: Record<string, unknown>;
  headers?: Record<string, unknown>;
  authHeader?: boolean;
  models?: ModelDefinitionConfig[];
  [key: string]: unknown;
};
export type ModelProviderDeclarationConfig = ModelProviderConfig;
export type ModelProviderConfigInput = ModelProviderConfig;
export type BedrockDiscoveryConfig = unknown;
export type DiscoveryToggleConfig = unknown;
export type ModelPricingConfig = unknown;
export type ModelsConfig = {
  providers?: Record<string, ModelProviderConfig>;
  [key: string]: unknown;
};
export type ModelsConfigInput = ModelsConfig;
export function isModelThinkingFormat(...args: unknown[]): unknown {
  return false;
}
export const MODEL_APIS: unknown = undefined as unknown;
export const MODEL_THINKING_FORMATS: unknown = undefined as unknown;

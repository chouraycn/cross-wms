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
  [key: string]: any;
};
export type ModelProviderConfig = {
  baseUrl?: string;
  apiKey?: any;
  auth?: ModelProviderAuthMode;
  api?: ModelApi;
  contextWindow?: number;
  contextTokens?: number;
  maxTokens?: number;
  timeoutSeconds?: number;
  region?: string;
  params?: Record<string, any>;
  headers?: Record<string, any>;
  authHeader?: boolean;
  models?: ModelDefinitionConfig[];
  [key: string]: any;
};
export type ModelProviderDeclarationConfig = ModelProviderConfig;
export type ModelProviderConfigInput = ModelProviderConfig;
export type BedrockDiscoveryConfig = unknown;
export type DiscoveryToggleConfig = unknown;
export type ModelPricingConfig = unknown;
export type ModelsConfig = {
  providers?: Record<string, ModelProviderConfig>;
  [key: string]: any;
};
export type ModelsConfigInput = ModelsConfig;
export function isModelThinkingFormat(...args: any[]): any {
  return false;
}
export const MODEL_APIS: any = undefined as any;
export const MODEL_THINKING_FORMATS: any = undefined as any;

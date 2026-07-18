// 移植自 openclaw/src/config/types.models.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ModelApi = unknown;
export type SupportedThinkingFormat = unknown;
export type ModelCompatConfig = unknown;
export type ModelImageInputConfig = unknown;
export type ModelMediaInputConfig = unknown;
export type ModelProviderAuthMode = unknown;
export type ModelProviderLocalServiceConfig = unknown;
export type ModelDefinitionConfig = unknown;
export type ModelProviderConfig = unknown;
export type ModelProviderDeclarationConfig = unknown;
export type ModelProviderConfigInput = unknown;
export type BedrockDiscoveryConfig = unknown;
export type DiscoveryToggleConfig = unknown;
export type ModelPricingConfig = unknown;
export type ModelsConfig = unknown;
export type ModelsConfigInput = unknown;
export function isModelThinkingFormat(...args: unknown[]): unknown {
  throw new Error("not implemented: isModelThinkingFormat");
}
export const MODEL_APIS: unknown = undefined;
export const MODEL_THINKING_FORMATS: unknown = undefined;

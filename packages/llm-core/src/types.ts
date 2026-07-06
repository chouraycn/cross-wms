export type ModelKind = 'llm' | 'embedding' | 'tts' | 'stt' | 'image' | 'video';

export type ModelCapability =
  | 'chat'
  | 'complete'
  | 'streaming'
  | 'tool_calls'
  | 'function_calling'
  | 'vision'
  | 'image_input'
  | 'json_mode'
  | 'seed'
  | 'stop_sequences'
  | 'logprobs'
  | 'reasoning'
  | 'long_context';

export interface ModelPricing {
  inputPerToken?: number;
  outputPerToken?: number;
  perRequest?: number;
  perImage?: number;
  perMinuteAudio?: number;
  currency?: string;
}

export interface ModelContextWindow {
  maxTokens: number;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  maxImageSize?: number;
  maxAudioDuration?: number;
}

export interface ModelRateLimits {
  requestsPerMinute?: number;
  tokensPerMinute?: number;
  requestsPerDay?: number;
  tokensPerDay?: number;
}

export interface UnifiedModelCatalogEntry {
  id: string;
  name: string;
  kind: ModelKind;
  provider: string;
  providerModelId: string;
  description?: string;
  tags?: string[];
  capabilities: ModelCapability[];
  contextWindow: ModelContextWindow;
  pricing: ModelPricing;
  rateLimits?: ModelRateLimits;
  defaultConfig?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
  };
  deprecated?: boolean;
  releaseDate?: string;
  supportsStreaming?: boolean;
  supportsTools?: boolean;
  isFreeTier?: boolean;
}

export interface ModelCatalogSource {
  id: string;
  name: string;
  models: UnifiedModelCatalogEntry[];
  lastUpdated: number;
}

export interface ModelFilterOptions {
  kind?: ModelKind;
  provider?: string;
  capabilities?: ModelCapability[];
  maxPricePer1kInput?: number;
  minContextWindow?: number;
  deprecated?: boolean;
  search?: string;
  tags?: string[];
}

export type ModelSortBy =
  | 'name'
  | 'context_window'
  | 'price_input'
  | 'price_output'
  | 'provider';

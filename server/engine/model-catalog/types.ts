export type ModelCapability =
  | 'vision'
  | 'audio'
  | 'json'
  | 'tool_use'
  | 'function_calling'
  | 'code'
  | 'multimodal'
  | 'reasoning'
  | 'streaming';

export type ModelType = 'chat' | 'completion' | 'embedding' | 'vision' | 'tts' | 'speech';

export type ModelCatalogSource =
  | 'config'
  | 'manifest'
  | 'cache'
  | 'runtime-refresh'
  | 'provider-index'
  | 'registry';

export type ModelCatalogStatus =
  | 'available'
  | 'preview'
  | 'deprecated'
  | 'experimental'
  | 'unavailable';

export type UnifiedModelCatalogKind = 'model' | 'provider';

export type UnifiedModelCatalogSource =
  | 'builtin'
  | 'plugin'
  | 'config'
  | 'runtime'
  | 'provider-index';

export interface ThinkingLevel {
  id: string;
  label: string;
  description?: string;
}

export interface ThinkingProfile {
  name?: string;
  description?: string;
  levels?: ThinkingLevel[];
  defaultLevel?: string;
}

export interface ModelPricing {
  inputPerMillion?: number;
  outputPerMillion?: number;
  isFree?: boolean;
  note?: string;
  currency?: string;
}

export interface ModelCatalogCost {
  input?: number;
  output?: number;
  unit?: 'tokens' | 'characters' | 'seconds';
  currency?: string;
}

export interface ModelCatalogTieredCost {
  tiers?: Array<{
    upTo?: number;
    input?: number;
    output?: number;
  }>;
}

export interface ModelCatalogInput {
  modalities: string[];
  maxSize?: number;
}

export interface ModelCatalogAlias {
  provider: string;
  api?: string;
  baseUrl?: string;
}

export interface ModelCatalogSuppression {
  provider: string;
  model: string;
  reason?: string;
  when?: 'always' | 'unauthorized' | 'deprecated';
}

export interface ModelCatalogDiscovery {
  mode: 'static' | 'dynamic' | 'hybrid';
  refreshInterval?: number;
}

export interface ModelCatalogModel {
  id: string;
  name?: string;
  description?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  input?: string[];
  reasoning?: boolean;
  status?: ModelCatalogStatus;
  capabilities?: ModelCapability[];
  pricing?: ModelCatalogCost;
  tieredPricing?: ModelCatalogTieredCost;
  aliases?: string[];
  tags?: string[];
  metadata?: Record<string, unknown>;
  isRecommended?: boolean;
  thinkingProfile?: ThinkingProfile;
}

export interface ModelCatalogProvider {
  id?: string;
  name?: string;
  description?: string;
  website?: string;
  api?: string;
  baseUrl?: string;
  models: ModelCatalogModel[];
  categories?: string[];
  authType?: string;
  docs?: string;
  icon?: string;
  isLocal?: boolean;
}

export interface ModelCatalog {
  version?: number;
  providers: Record<string, ModelCatalogProvider>;
  aliases?: Record<string, ModelCatalogAlias>;
  suppressions?: ModelCatalogSuppression[];
  discovery?: Record<string, ModelCatalogDiscovery>;
  runtimeAugment?: boolean;
  updatedAt?: string;
}

export interface NormalizedModelCatalogRow {
  provider: string;
  id: string;
  ref: string;
  mergeKey: string;
  name: string;
  source: ModelCatalogSource;
  input: string[];
  reasoning: boolean;
  status: ModelCatalogStatus;
  api?: string;
  baseUrl?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  capabilities?: ModelCapability[];
  pricing?: ModelCatalogCost;
  description?: string;
  isRecommended?: boolean;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface UnifiedModelCatalogEntry {
  kind: UnifiedModelCatalogKind;
  id: string;
  provider: string;
  name: string;
  type: ModelType;
  description?: string;
  capabilities: ModelCapability[];
  contextWindow: number;
  maxOutputTokens?: number;
  status: ModelCatalogStatus;
  source: UnifiedModelCatalogSource;
  authStatus: 'authenticated' | 'unauthenticated' | 'pending';
  available: boolean;
  pricing?: ModelPricing;
  aliases?: string[];
  isRecommended?: boolean;
  thinkingProfile?: ThinkingProfile;
  metadata?: Record<string, unknown>;
}

export interface ModelManifest {
  id: string;
  name: string;
  provider: string;
  version?: string;
  description?: string;
  type: ModelType;
  capabilities: ModelCapability[];
  contextWindow: number;
  maxOutputTokens?: number;
  inputModalities?: string[];
  outputModalities?: string[];
  pricing?: ModelPricing;
  status?: ModelCatalogStatus;
  tags?: string[];
  aliases?: string[];
  isRecommended?: boolean;
  thinkingProfile?: ThinkingProfile;
  metadata?: Record<string, unknown>;
}

export interface ModelSearchParams {
  query?: string;
  provider?: string;
  type?: ModelType;
  capability?: ModelCapability;
  status?: ModelCatalogStatus;
  availableOnly?: boolean;
  minContextWindow?: number;
  tags?: string[];
}

export interface ModelSearchResult {
  models: UnifiedModelCatalogEntry[];
  total: number;
}

export interface ModelSelectionCriteria {
  capability?: ModelCapability;
  contextWindow?: number;
  provider?: string;
  type?: ModelType;
  preferRecommended?: boolean;
  status?: ModelCatalogStatus;
}

export interface ModelRegistryEntry {
  model: ModelManifest;
  provider: string;
  source: UnifiedModelCatalogSource;
  registeredAt: number;
  updatedAt: number;
}

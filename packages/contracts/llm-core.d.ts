/**
 * @cdf-know/llm-core STABLE API 契约声明
 *
 * 本文件定义了 @cdf-know/llm-core 包中所有 STABLE 等级公共 API 的
 * 类型契约。任何 STABLE API 的移除或签名变更均视为破坏性变更。
 *
 * 仅供契约检查脚本使用，不应被其他包直接导入。
 */

// ── 核心类型 ──

export type ModelKind = string;
export type ModelCapability = string;
export type ModelSortBy = string;
export type ProviderType = string;

export interface ModelPricing {
  inputPerToken?: number;
  outputPerToken?: number;
}

export interface ModelContextWindow {
  maxInputTokens?: number;
  maxOutputTokens?: number;
}

export interface ModelRateLimits {
  requestsPerMinute?: number;
  tokensPerMinute?: number;
}

export interface UnifiedModelCatalogEntry {
  id: string;
  name: string;
  kind: ModelKind;
  capabilities?: ModelCapability[];
  pricing?: ModelPricing;
  contextWindow?: ModelContextWindow;
  rateLimits?: ModelRateLimits;
  provider?: string;
  tags?: string[];
}

export type ModelCatalogSource = object;

export interface ModelFilterOptions {
  kind?: ModelKind;
  capabilities?: ModelCapability[];
  provider?: string;
  tags?: string[];
}

export interface ProviderAuthContext {
  apiKey?: string;
  baseUrl?: string;
  headers?: Record<string, string>;
}

export interface ProviderAuthResult {
  success: boolean;
  error?: string;
}

export interface ProviderModel {
  id: string;
  name: string;
  kind: ModelKind;
}

export interface LlmProvider {
  id: string;
  type: ProviderType;
  authenticate(context: ProviderAuthContext): Promise<ProviderAuthResult>;
  listModels(): ProviderModel[];
}

export interface CostEstimation {
  inputCost: number;
  outputCost: number;
  totalCost: number;
}

// ── 事件类型 ──

export interface ModelCatalogEvents {
  [key: string]: unknown;
}

export interface ProviderRegistryEvents {
  [key: string]: unknown;
}

// ── 核心类 ──

export declare class UnifiedModelCatalog {
  addSource(source: ModelCatalogSource): void;
  removeSource(sourceId: string): void;
  addModel(entry: UnifiedModelCatalogEntry): void;
  removeModel(modelId: string): void;
  getModel(modelId: string): UnifiedModelCatalogEntry | undefined;
  listModels(options?: ModelFilterOptions): UnifiedModelCatalogEntry[];
  listProviders(): string[];
  listTags(): string[];
  sortModels(by: ModelSortBy): UnifiedModelCatalogEntry[];
  estimateCost(modelId: string, inputTokens: number, outputTokens: number): CostEstimation;
  hasModel(modelId: string): boolean;
  size(): number;
  clear(): void;
  export(): UnifiedModelCatalogEntry[];
}

export declare class ProviderRegistry {
  registerProvider(provider: LlmProvider): void;
  unregisterProvider(providerId: string): void;
  getProvider(providerId: string): LlmProvider | undefined;
  listProviders(): LlmProvider[];
}

export declare class CostEstimator {
  setPricing(modelId: string, pricing: ModelPricing): void;
  estimate(modelId: string, inputTokens: number, outputTokens: number): CostEstimation;
  trackUsage(modelId: string, inputTokens: number, outputTokens: number): void;
  getTotalUsage(): Record<string, unknown>;
  getTotalCost(): number;
  reset(): void;
  formatCost(cost: number): string;
}

// ── 单例 ──

export declare const unifiedModelCatalog: UnifiedModelCatalog;
export declare const providerRegistry: ProviderRegistry;
export declare const costEstimator: CostEstimator;

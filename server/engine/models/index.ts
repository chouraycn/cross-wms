/**
 * Models 模块 — 模型提供商管理 barrel 导出
 *
 * 聚合所有模型相关子模块的公开 API，包括：
 * - Provider 注册表（modelProviderRegistry）
 * - 模型目录（modelCatalog）
 * - 模型元数据（modelMetadata）
 * - 故障转移（modelFailover）
 * - 运行时策略（modelRuntimePolicy）
 * - 模型解析（models）
 */

// ==================== Provider 注册表 ====================
export {
  getAllProviders,
  getProviderById,
  registerProvider,
  unregisterProvider,
  getCatalogIndex,
} from "../modelProviderRegistry.js";

// ==================== 模型目录 ====================
export type {
  ModelCapability,
  ModelType,
  ThinkingLevel,
  ThinkingProfile,
  ModelPricing as CatalogModelPricing,
  ModelInfo,
  ProviderAuth,
  ModelCatalogIndex,
  ProviderInfo,
  ModelCatalogEntry,
  ModelSearchParams,
  ModelSearchResult,
} from "../modelCatalog.js";
export {
  getModelCatalogEntry,
  listModelCatalog,
  searchModelCatalog,
  findBestModel,
  updateModelAvailability,
  getProviders,
  getModelTypes,
  getCapabilities,
} from "../modelCatalog.js";

// ==================== 模型元数据 ====================
export type {
  ModelContextLimits,
  ModelPricing as MetadataModelPricing,
  ModelCapabilities,
  ModelMetadata,
} from "../modelMetadata.js";
export { getModelMetadataStore } from "../modelMetadata.js";

// ==================== 故障转移 ====================
export type {
  FailoverPolicy,
  ErrorCategory,
  ModelFailoverOptions,
} from "../modelFailover.js";
export {
  ModelFailoverManager,
  getModelFailoverManager,
} from "../modelFailover.js";

// ==================== 运行时策略 ====================
export type {
  PolicySource,
  RuntimePolicyConfig,
  ResolvedModelRuntimePolicy,
  ResolveModelRuntimePolicyParams,
} from "../modelRuntimePolicy.js";
export {
  resolveModelRuntimePolicy,
  needsAutoSelection,
  getPolicySummary,
} from "../modelRuntimePolicy.js";

// ==================== 模型解析 ====================
export type {
  ModelListResult,
  ModelAuthStatusResult,
  ModelResolveParams,
  ModelResolveResult,
} from "../models.js";
export {
  modelList,
  modelAuthStatus,
  modelResolve,
  getModelById,
  getAllModels,
  updateModelAuthStatus,
} from "../models.js";

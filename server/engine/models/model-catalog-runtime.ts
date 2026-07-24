/**
 * 运行时目录 — 运行时的模型目录管理
 *
 * 管理运行时动态加载的模型目录，支持从配置、
 * 插件、环境变量等多个来源合并模型目录。
 */

import { logger } from '../../logger.js';
import { getCatalogStateCache, type CatalogStateEntry } from './model-catalog-state-cache.js';
import {
  findModelById,
  findModelsByProvider,
  searchCatalog,
  type CatalogLookupOptions,
  type ModelLookupResult,
} from './model-catalog-lookup.js';
import {
  browseCatalog,
  browseProviders,
  type CatalogBrowseParams,
  type CatalogBrowseResult,
  type ProviderBrowseResult,
} from './model-catalog-browse.js';
import { normalizeProviderId, normalizeModelId } from './model-selection-normalize.js';

export interface RuntimeCatalogModel {
  id: string;
  name: string;
  provider: string;
  description?: string;
  capabilities?: string[];
  contextWindow?: number;
  maxTokens?: number;
  isRecommended?: boolean;
  isDeprecated?: boolean;
  isBeta?: boolean;
  aliases?: string[];
  inputModalities?: string[];
  pricing?: {
    inputPerMillion?: number;
    outputPerMillion?: number;
  };
  source: 'builtin' | 'config' | 'plugin' | 'env' | 'dynamic';
  authStatus: 'authenticated' | 'unauthenticated' | 'pending';
}

export interface RuntimeCatalogProvider {
  id: string;
  name: string;
  description?: string;
  models: RuntimeCatalogModel[];
  categories?: string[];
  baseUrl?: string;
  authType?: string;
  isLocal?: boolean;
  source: 'builtin' | 'config' | 'plugin' | 'env';
}

export interface RuntimeCatalogStats {
  totalModels: number;
  totalProviders: number;
  authenticatedModels: number;
  recommendedModels: number;
  sources: Record<string, number>;
}

export class RuntimeCatalog {
  private providers = new Map<string, RuntimeCatalogProvider>();
  private modelsById = new Map<string, RuntimeCatalogModel>();
  private modelsByProvider = new Map<string, RuntimeCatalogModel[]>();
  private stateCache = getCatalogStateCache();

  addProvider(provider: RuntimeCatalogProvider): void {
    this.providers.set(provider.id, provider);

    for (const model of provider.models) {
      this.modelsById.set(model.id, model);

      const providerModels = this.modelsByProvider.get(provider.id) || [];
      providerModels.push(model);
      this.modelsByProvider.set(provider.id, providerModels);

      this.stateCache.set(model.id, {
        modelId: model.id,
        available: model.authStatus === 'authenticated',
        authStatus: model.authStatus,
        healthStatus: 'unknown',
      });
    }

    logger.debug(`[RuntimeCatalog] 添加 Provider: ${provider.id} (${provider.models.length} 个模型)`);
  }

  removeProvider(providerId: string): boolean {
    const provider = this.providers.get(providerId);
    if (!provider) return false;

    for (const model of provider.models) {
      this.modelsById.delete(model.id);
      this.stateCache.delete(model.id);
    }

    this.modelsByProvider.delete(providerId);
    this.providers.delete(providerId);

    logger.debug(`[RuntimeCatalog] 移除 Provider: ${providerId}`);
    return true;
  }

  getProvider(providerId: string): RuntimeCatalogProvider | undefined {
    return this.providers.get(providerId);
  }

  getAllProviders(): RuntimeCatalogProvider[] {
    return Array.from(this.providers.values());
  }

  getModel(modelId: string): RuntimeCatalogModel | undefined {
    return this.modelsById.get(modelId);
  }

  getAllModels(): RuntimeCatalogModel[] {
    return Array.from(this.modelsById.values());
  }

  getModelsByProvider(providerId: string): RuntimeCatalogModel[] {
    return [...(this.modelsByProvider.get(providerId) || [])];
  }

  findModel(
    modelId: string,
    options?: CatalogLookupOptions,
  ): ModelLookupResult<RuntimeCatalogModel> {
    return findModelById(this.getAllModels(), modelId, options);
  }

  search(query: string): RuntimeCatalogModel[] {
    return searchCatalog(this.getAllModels(), query);
  }

  browse(params?: CatalogBrowseParams): CatalogBrowseResult<RuntimeCatalogModel> {
    return browseCatalog(this.getAllModels(), params);
  }

  browseProviders(options?: {
    category?: string;
    sortBy?: 'name' | 'modelCount';
    sortOrder?: 'asc' | 'desc';
  }): ProviderBrowseResult {
    return browseProviders(this.getAllProviders(), options);
  }

  getRecommendedModels(): RuntimeCatalogModel[] {
    return this.getAllModels().filter(m => m.isRecommended);
  }

  getAuthenticatedModels(): RuntimeCatalogModel[] {
    return this.getAllModels().filter(m => m.authStatus === 'authenticated');
  }

  updateModelAuthStatus(
    modelId: string,
    authStatus: RuntimeCatalogModel['authStatus'],
  ): void {
    const model = this.modelsById.get(modelId);
    if (model) {
      model.authStatus = authStatus;
      this.stateCache.updateAuthStatus(modelId, authStatus);
    }
  }

  getModelState(modelId: string): CatalogStateEntry | undefined {
    return this.stateCache.get(modelId);
  }

  recordModelSuccess(modelId: string): void {
    this.stateCache.recordSuccess(modelId);
  }

  recordModelError(modelId: string): void {
    this.stateCache.recordError(modelId);
  }

  getStats(): RuntimeCatalogStats {
    const models = this.getAllModels();
    const sources: Record<string, number> = {};

    for (const model of models) {
      sources[model.source] = (sources[model.source] ?? 0) + 1;
    }

    return {
      totalModels: models.length,
      totalProviders: this.providers.size,
      authenticatedModels: models.filter(m => m.authStatus === 'authenticated').length,
      recommendedModels: models.filter(m => m.isRecommended).length,
      sources,
    };
  }

  clear(): void {
    this.providers.clear();
    this.modelsById.clear();
    this.modelsByProvider.clear();
    this.stateCache.clear();
    logger.info('[RuntimeCatalog] 已清空运行时目录');
  }
}

let globalRuntimeCatalog: RuntimeCatalog | null = null;

export function getRuntimeCatalog(): RuntimeCatalog {
  if (!globalRuntimeCatalog) {
    globalRuntimeCatalog = new RuntimeCatalog();
  }
  return globalRuntimeCatalog;
}

export function initializeRuntimeCatalogFromRegistry(): RuntimeCatalog {
  const catalog = getRuntimeCatalog();

  try {
    const { getAllProviders: getAllRegistryProviders } = require('../modelProviderRegistry.js');
    const providers = getAllRegistryProviders();

    for (const provider of providers) {
      const models: RuntimeCatalogModel[] = provider.models.map((m: Record<string, unknown>) => ({
        id: String(m.id ?? ''),
        name: String(m.name ?? ''),
        provider: provider.id,
        description: m.description as string | undefined,
        capabilities: m.capabilities as string[] | undefined,
        contextWindow: m.contextWindow as number | undefined,
        maxTokens: m.maxTokens as number | undefined,
        isRecommended: m.isRecommended as boolean | undefined,
        aliases: m.aliases as string[] | undefined,
        pricing: m.pricing as { inputPerMillion?: number; outputPerMillion?: number } | undefined,
        source: 'builtin' as const,
        authStatus: (m.authStatus as 'authenticated' | 'unauthenticated' | 'pending' | undefined) ?? 'pending',
      }));

      catalog.addProvider({
        id: provider.id,
        name: provider.name,
        description: provider.description,
        models,
        categories: provider.categories,
        baseUrl: provider.baseUrl,
        authType: provider.authType,
        isLocal: provider.isLocal,
        source: 'builtin',
      });
    }

    logger.info(`[RuntimeCatalog] 已从注册表初始化: ${providers.length} 个 Provider`);
  } catch (e) {
    logger.error('[RuntimeCatalog] 从注册表初始化失败:', e);
  }

  return catalog;
}

import type {
  ModelManifest,
  ModelRegistryEntry,
  UnifiedModelCatalogSource,
  ModelType,
  ModelCapability,
} from './types';
import { logger } from '../../logger.js';

export class ModelRegistry {
  private entries: Map<string, ModelRegistryEntry> = new Map();
  private providerModels: Map<string, Set<string>> = new Map();

  constructor() {}

  register(model: ModelManifest, source: UnifiedModelCatalogSource = 'builtin'): boolean {
    const key = this.buildKey(model.provider, model.id);
    const now = Date.now();

    if (this.entries.has(key)) {
      const existing = this.entries.get(key)!;
      if (this.isHigherPrioritySource(source, existing.source)) {
        this.entries.set(key, {
          model,
          provider: model.provider,
          source,
          registeredAt: existing.registeredAt,
          updatedAt: now,
        });
        logger.debug(`[ModelRegistry] 更新模型: ${key} (${source})`);
        return true;
      }
      logger.debug(`[ModelRegistry] 跳过低优先级模型: ${key}`);
      return false;
    }

    this.entries.set(key, {
      model,
      provider: model.provider,
      source,
      registeredAt: now,
      updatedAt: now,
    });

    const providerSet = this.providerModels.get(model.provider) ?? new Set();
    providerSet.add(model.id);
    this.providerModels.set(model.provider, providerSet);

    logger.debug(`[ModelRegistry] 注册模型: ${key} (${source})`);
    return true;
  }

  unregister(provider: string, modelId: string): boolean {
    const key = this.buildKey(provider, modelId);
    if (!this.entries.has(key)) {
      return false;
    }
    this.entries.delete(key);
    const providerSet = this.providerModels.get(provider);
    if (providerSet) {
      providerSet.delete(modelId);
      if (providerSet.size === 0) {
        this.providerModels.delete(provider);
      }
    }
    logger.debug(`[ModelRegistry] 注销模型: ${key}`);
    return true;
  }

  get(provider: string, modelId: string): ModelRegistryEntry | undefined {
    const key = this.buildKey(provider, modelId);
    return this.entries.get(key);
  }

  getById(modelId: string): ModelRegistryEntry | undefined {
    const normalizedId = modelId.toLowerCase();
    for (const entry of this.entries.values()) {
      if (entry.model.id.toLowerCase() === normalizedId) {
        return entry;
      }
      if (entry.model.aliases?.some((a) => a.toLowerCase() === normalizedId)) {
        return entry;
      }
    }
    return undefined;
  }

  list(): ModelRegistryEntry[] {
    return [...this.entries.values()].toSorted((a, b) =>
      a.provider.localeCompare(b.provider) || a.model.id.localeCompare(b.model.id),
    );
  }

  listByProvider(provider: string): ModelRegistryEntry[] {
    const normalizedProvider = provider.toLowerCase();
    return this.list().filter((entry) => entry.provider.toLowerCase() === normalizedProvider);
  }

  listProviders(): string[] {
    return [...this.providerModels.keys()].toSorted((a, b) => a.localeCompare(b));
  }

  search(params: {
    query?: string;
    provider?: string;
    type?: ModelType;
    capability?: ModelCapability;
  }): ModelRegistryEntry[] {
    let results = this.list();

    if (params.query) {
      const queryLower = params.query.toLowerCase();
      results = results.filter(
        (entry) =>
          entry.model.id.toLowerCase().includes(queryLower) ||
          entry.model.name.toLowerCase().includes(queryLower) ||
          entry.model.description?.toLowerCase().includes(queryLower) ||
          entry.model.aliases?.some((a) => a.toLowerCase().includes(queryLower)),
      );
    }

    if (params.provider) {
      const providerLower = params.provider.toLowerCase();
      results = results.filter((entry) => entry.provider.toLowerCase() === providerLower);
    }

    if (params.type) {
      results = results.filter((entry) => entry.model.type === params.type);
    }

    if (params.capability) {
      results = results.filter((entry) => entry.model.capabilities.includes(params.capability!));
    }

    return results;
  }

  has(provider: string, modelId: string): boolean {
    const key = this.buildKey(provider, modelId);
    return this.entries.has(key);
  }

  size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
    this.providerModels.clear();
    logger.info('[ModelRegistry] 清空注册表');
  }

  private buildKey(provider: string, modelId: string): string {
    return `${provider.toLowerCase()}::${modelId.toLowerCase()}`;
  }

  private isHigherPrioritySource(
    newSource: UnifiedModelCatalogSource,
    existingSource: UnifiedModelCatalogSource,
  ): boolean {
    const priority: Record<UnifiedModelCatalogSource, number> = {
      config: 0,
      plugin: 1,
      builtin: 2,
      runtime: 3,
      'provider-index': 4,
    };
    return (priority[newSource] ?? 99) < (priority[existingSource] ?? 99);
  }
}

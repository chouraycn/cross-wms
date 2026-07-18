import { ModelRegistry } from './model-registry';
import { loadProviderIndex } from './provider-index/load';
import { mergeRowsByAuthority } from './authority';
import { planManifestModelCatalogRows, planManifestModelCatalogSuppressions } from './manifest-planner';
import { planProviderIndexModelCatalogRows } from './provider-index-planner';
import type {
  ModelCapability,
  ModelType,
  ModelSearchParams,
  ModelSearchResult,
  ModelSelectionCriteria,
  UnifiedModelCatalogEntry,
  NormalizedModelCatalogRow,
  ModelManifest,
  UnifiedModelCatalogSource,
  ModelCatalogStatus,
  ModelCatalog as ModelCatalogManifest,
  ModelPricing,
  ThinkingProfile,
} from './types';
import type { ProviderIndex } from './provider-index/types';
import { logger } from '../../logger.js';

export class ModelCatalog {
  private registry: ModelRegistry;
  private providerIndex: ProviderIndex;
  private manifestRows: NormalizedModelCatalogRow[] = [];
  private providerIndexRows: NormalizedModelCatalogRow[] = [];
  private mergedRows: NormalizedModelCatalogRow[] = [];
  private modelAuthStatuses: Map<string, 'authenticated' | 'unauthenticated' | 'pending'> =
    new Map();

  constructor() {
    this.registry = new ModelRegistry();
    this.providerIndex = loadProviderIndex();
    this.initializeBuiltinModels();
    this.rebuildMergedRows();
  }

  private initializeBuiltinModels(): void {
    const builtinModels: ModelManifest[] = [
      {
        id: 'claude-3-5-sonnet',
        name: 'Claude 3.5 Sonnet',
        provider: 'anthropic',
        type: 'chat',
        capabilities: ['vision', 'json', 'tool_use', 'function_calling', 'code', 'multimodal'],
        contextWindow: 200_000,
        maxOutputTokens: 8192,
        inputModalities: ['text', 'image'],
        status: 'available',
        isRecommended: true,
        description: 'Anthropic 的最新模型，平衡性能和成本',
      },
      {
        id: 'claude-3-opus',
        name: 'Claude 3 Opus',
        provider: 'anthropic',
        type: 'chat',
        capabilities: ['vision', 'json', 'tool_use', 'function_calling', 'code', 'multimodal'],
        contextWindow: 200_000,
        maxOutputTokens: 8192,
        inputModalities: ['text', 'image'],
        status: 'available',
        description: 'Anthropic 的旗舰模型，最高推理能力',
      },
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        provider: 'openai',
        type: 'chat',
        capabilities: ['vision', 'audio', 'json', 'tool_use', 'function_calling', 'code', 'multimodal'],
        contextWindow: 128_000,
        maxOutputTokens: 4096,
        inputModalities: ['text', 'image', 'audio'],
        status: 'available',
        description: 'OpenAI 的多模态模型',
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o mini',
        provider: 'openai',
        type: 'chat',
        capabilities: ['vision', 'json', 'tool_use', 'function_calling', 'code', 'multimodal'],
        contextWindow: 128_000,
        maxOutputTokens: 16384,
        inputModalities: ['text', 'image'],
        status: 'available',
        description: 'GPT-4o 的轻量版本，更快更便宜',
      },
      {
        id: 'deepseek-chat',
        name: 'DeepSeek Chat',
        provider: 'deepseek',
        type: 'chat',
        capabilities: ['json', 'tool_use', 'function_calling', 'code'],
        contextWindow: 128_000,
        maxOutputTokens: 4096,
        inputModalities: ['text'],
        status: 'available',
        description: '深度求索聊天模型',
      },
      {
        id: 'gemini-1.5-flash',
        name: 'Gemini 1.5 Flash',
        provider: 'google',
        type: 'chat',
        capabilities: ['vision', 'audio', 'json', 'tool_use', 'function_calling', 'code', 'multimodal'],
        contextWindow: 1_000_000,
        maxOutputTokens: 8192,
        inputModalities: ['text', 'image', 'audio'],
        status: 'available',
        description: 'Google 的快速多模态模型',
      },
    ];

    for (const model of builtinModels) {
      this.registry.register(model, 'builtin');
    }

    for (const model of builtinModels) {
      this.modelAuthStatuses.set(
        `${model.provider}::${model.id}`,
        model.provider === 'anthropic' || model.provider === 'deepseek'
          ? 'authenticated'
          : model.provider === 'google'
            ? 'pending'
            : 'unauthenticated',
      );
    }

    logger.info(`[ModelCatalog] 初始化完成，内置 ${builtinModels.length} 个模型`);
  }

  private rebuildMergedRows(): void {
    const registryRows = this.buildRegistryRows();
    const allRows = [
      ...registryRows,
      ...this.manifestRows,
      ...this.providerIndexRows,
    ];
    this.mergedRows = mergeRowsByAuthority(allRows);
    logger.debug(`[ModelCatalog] 合并后共 ${this.mergedRows.length} 个模型条目`);
  }

  private buildRegistryRows(): NormalizedModelCatalogRow[] {
    const entries = this.registry.list();
    return entries.map((entry) => {
      const model = entry.model;
      const provider = entry.provider;
      const modelId = model.id;
      const mergeKey = `${provider.toLowerCase()}::${modelId.toLowerCase()}`;
      const ref = `${provider.toLowerCase()}/${modelId.toLowerCase()}`;
      return {
        provider: provider.toLowerCase(),
        id: modelId.toLowerCase(),
        ref,
        mergeKey,
        name: model.name,
        source: this.mapSource(entry.source),
        input: model.inputModalities ?? ['text'],
        reasoning: model.capabilities.includes('reasoning'),
        status: model.status ?? 'available',
        contextWindow: model.contextWindow,
        maxOutputTokens: model.maxOutputTokens,
        capabilities: model.capabilities,
        description: model.description,
        isRecommended: model.isRecommended,
        tags: model.tags,
        metadata: model.metadata,
      };
    });
  }

  private mapSource(source: UnifiedModelCatalogSource): 'config' | 'manifest' | 'cache' | 'runtime-refresh' | 'provider-index' | 'registry' {
    switch (source) {
      case 'config':
        return 'config';
      case 'plugin':
        return 'manifest';
      case 'runtime':
        return 'runtime-refresh';
      case 'builtin':
        return 'registry';
      case 'provider-index':
        return 'provider-index';
      default:
        return 'registry';
    }
  }

  getModel(modelId: string): UnifiedModelCatalogEntry | undefined {
    const normalizedId = modelId.toLowerCase();
    const row = this.mergedRows.find(
      (r) => r.id === normalizedId || r.ref.endsWith(`/${normalizedId}`),
    );
    if (!row) {
      return undefined;
    }
    return this.rowToUnifiedEntry(row);
  }

  getModelByProvider(provider: string, modelId: string): UnifiedModelCatalogEntry | undefined {
    const key = `${provider.toLowerCase()}::${modelId.toLowerCase()}`;
    const row = this.mergedRows.find((r) => r.mergeKey === key);
    if (!row) {
      return undefined;
    }
    return this.rowToUnifiedEntry(row);
  }

  listModels(): UnifiedModelCatalogEntry[] {
    return this.mergedRows.map((row) => this.rowToUnifiedEntry(row));
  }

  search(params: ModelSearchParams): ModelSearchResult {
    let models = this.listModels();

    if (params.query) {
      const queryLower = params.query.toLowerCase();
      models = models.filter(
        (m) =>
          m.id.toLowerCase().includes(queryLower) ||
          m.name.toLowerCase().includes(queryLower) ||
          m.description?.toLowerCase().includes(queryLower) ||
          m.provider.toLowerCase().includes(queryLower),
      );
    }

    if (params.provider) {
      const providerLower = params.provider.toLowerCase();
      models = models.filter((m) => m.provider.toLowerCase() === providerLower);
    }

    if (params.type) {
      models = models.filter((m) => m.type === params.type);
    }

    if (params.capability) {
      models = models.filter((m) => m.capabilities.includes(params.capability!));
    }

    if (params.status) {
      models = models.filter((m) => m.status === params.status);
    }

    if (params.availableOnly) {
      models = models.filter((m) => m.available);
    }

    if (params.minContextWindow) {
      models = models.filter((m) => m.contextWindow >= params.minContextWindow!);
    }

    if (params.tags && params.tags.length > 0) {
      const tagSet = new Set(params.tags.map((t) => t.toLowerCase()));
      models = models.filter((m) => m.capabilities.some((c) => tagSet.has(c.toLowerCase())));
    }

    logger.debug(`[ModelCatalog] 搜索结果: ${models.length} 个模型`);

    return {
      models,
      total: models.length,
    };
  }

  findBestModel(params: ModelSelectionCriteria): UnifiedModelCatalogEntry | undefined {
    let models = this.listModels().filter((m) => m.available);

    if (params.capability) {
      models = models.filter((m) => m.capabilities.includes(params.capability!));
    }

    if (params.provider) {
      const providerLower = params.provider.toLowerCase();
      models = models.filter((m) => m.provider.toLowerCase() === providerLower);
    }

    if (params.contextWindow) {
      models = models.filter((m) => m.contextWindow >= params.contextWindow!);
    }

    if (params.type) {
      models = models.filter((m) => m.type === params.type);
    }

    if (params.status) {
      models = models.filter((m) => m.status === params.status);
    }

    if (models.length === 0) {
      return undefined;
    }

    if (params.preferRecommended) {
      const recommended = models.filter((m) => m.isRecommended);
      if (recommended.length > 0) {
        models = recommended;
      }
    }

    if (params.contextWindow) {
      return models.reduce((best, current) =>
        current.contextWindow >= params.contextWindow! && current.contextWindow < best.contextWindow
          ? current
          : best,
      );
    }

    return models[0];
  }

  listProviders(): string[] {
    const providers = new Set<string>();
    for (const row of this.mergedRows) {
      providers.add(row.provider);
    }
    return [...providers].toSorted((a, b) => a.localeCompare(b));
  }

  getModelTypes(): ModelType[] {
    return ['chat', 'completion', 'embedding', 'vision', 'tts', 'speech'];
  }

  getCapabilities(): ModelCapability[] {
    return ['vision', 'audio', 'json', 'tool_use', 'function_calling', 'code', 'multimodal', 'reasoning', 'streaming'];
  }

  updateModelAuthStatus(
    provider: string,
    modelId: string,
    status: 'authenticated' | 'unauthenticated' | 'pending',
  ): void {
    const key = `${provider.toLowerCase()}::${modelId.toLowerCase()}`;
    this.modelAuthStatuses.set(key, status);
    logger.info(`[ModelCatalog] 更新模型认证状态: ${provider}/${modelId} → ${status}`);
  }

  getModelAuthStatus(provider: string, modelId: string): 'authenticated' | 'unauthenticated' | 'pending' {
    const key = `${provider.toLowerCase()}::${modelId.toLowerCase()}`;
    return this.modelAuthStatuses.get(key) ?? 'pending';
  }

  registerModel(model: ModelManifest, source: UnifiedModelCatalogSource = 'runtime'): boolean {
    const result = this.registry.register(model, source);
    if (result) {
      this.rebuildMergedRows();
    }
    return result;
  }

  unregisterModel(provider: string, modelId: string): boolean {
    const result = this.registry.unregister(provider, modelId);
    if (result) {
      this.rebuildMergedRows();
    }
    return result;
  }

  loadManifestCatalog(catalog: ModelCatalogManifest, pluginId: string): void {
    const plan = planManifestModelCatalogRows({
      registry: {
        plugins: [
          {
            id: pluginId,
            providers: Object.keys(catalog.providers),
            modelCatalog: catalog,
          },
        ],
      },
    });
    this.manifestRows = [...this.manifestRows, ...plan.rows];
    this.rebuildMergedRows();
    logger.info(`[ModelCatalog] 加载清单目录，新增 ${plan.rows.length} 个模型`);
  }

  loadProviderIndex(index?: ProviderIndex): void {
    const idx = index ?? this.providerIndex;
    const plan = planProviderIndexModelCatalogRows({ index: idx });
    this.providerIndexRows = [...plan.rows];
    this.rebuildMergedRows();
    logger.info(`[ModelCatalog] 加载 Provider 索引，${plan.entries.length} 个 provider，${plan.rows.length} 个预览模型`);
  }

  getProviderIndex(): ProviderIndex {
    return this.providerIndex;
  }

  getRegistry(): ModelRegistry {
    return this.registry;
  }

  private rowToUnifiedEntry(row: NormalizedModelCatalogRow): UnifiedModelCatalogEntry {
    const authStatus = this.getModelAuthStatus(row.provider, row.id);
    const available = authStatus === 'authenticated' && row.status === 'available';
    return {
      kind: 'model',
      id: row.id,
      provider: row.provider,
      name: row.name,
      type: 'chat',
      description: row.description,
      capabilities: row.capabilities ?? ['json', 'tool_use'],
      contextWindow: row.contextWindow ?? 128_000,
      maxOutputTokens: row.maxOutputTokens,
      status: row.status,
      source: this.mapUnifiedSource(row.source),
      authStatus,
      available,
      isRecommended: row.isRecommended,
      metadata: row.metadata,
    };
  }

  private mapUnifiedSource(
    source: 'config' | 'manifest' | 'cache' | 'runtime-refresh' | 'provider-index' | 'registry',
  ): UnifiedModelCatalogSource {
    switch (source) {
      case 'config':
        return 'config';
      case 'manifest':
        return 'plugin';
      case 'registry':
        return 'builtin';
      case 'runtime-refresh':
        return 'runtime';
      case 'provider-index':
        return 'provider-index';
      default:
        return 'builtin';
    }
  }
}

export const modelCatalog = new ModelCatalog();

export { ModelRegistry } from './model-registry';
export { loadProviderIndex, normalizeProviderIndex } from './provider-index';
export { mergeRowsByAuthority, getSourceAuthority, compareSources, hasHigherOrEqualAuthority } from './authority';
export { planManifestModelCatalogRows, planManifestModelCatalogSuppressions } from './manifest-planner';
export { planProviderIndexModelCatalogRows } from './provider-index-planner';

export type * from './types';
export type * from './provider-index/types';

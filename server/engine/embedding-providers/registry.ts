import { logger } from '../../logger.js';
import type {
  BaseEmbeddingProvider,
  EmbeddingProviderFactory,
  EmbeddingProviderConfig,
  EmbeddingProviderRegistration,
  EmbeddingProviderStats,
  EmbeddingResult,
  BatchEmbeddingResult,
} from './types.js';

class EmbeddingProviderRegistry {
  private providers: Map<string, EmbeddingProviderRegistration> = new Map();
  private defaultProviderId: string | null = null;
  private activeInstances: Map<string, BaseEmbeddingProvider> = new Map();
  private providerStats: Map<string, EmbeddingProviderStats> = new Map();
  private initializationPromises: Map<string, Promise<void>> = new Map();

  register(
    id: string,
    factory: EmbeddingProviderFactory,
    config: EmbeddingProviderConfig,
    options: { isDefault?: boolean; priority?: number } = {}
  ): void {
    if (this.providers.has(id)) {
      logger.warn(`[EmbeddingRegistry] Provider ${id} 已注册，将被覆盖`);
    }

    this.providers.set(id, {
      id,
      factory,
      config,
      isDefault: options.isDefault,
      priority: options.priority ?? 0,
    });

    if (options.isDefault || !this.defaultProviderId) {
      this.defaultProviderId = id;
    }

    this.providerStats.set(id, {
      totalCalls: 0,
      totalTexts: 0,
      cacheHits: 0,
      cacheMisses: 0,
      totalDurationMs: 0,
      avgDurationMs: 0,
    });

    logger.info(
      `[EmbeddingRegistry] 注册嵌入提供者: ${id} (${config.displayName}, ${config.dimensions}维)`
    );
  }

  unregister(id: string): boolean {
    const instance = this.activeInstances.get(id);
    if (instance) {
      instance.dispose().catch(err => {
        logger.error(`[EmbeddingRegistry] 销毁 provider ${id} 失败:`, err);
      });
      this.activeInstances.delete(id);
    }

    const existed = this.providers.delete(id);
    if (existed && this.defaultProviderId === id) {
      const remaining = Array.from(this.providers.values())
        .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
      this.defaultProviderId = remaining[0]?.id ?? null;
    }

    return existed;
  }

  has(id: string): boolean {
    return this.providers.has(id);
  }

  getConfig(id: string): EmbeddingProviderConfig | null {
    return this.providers.get(id)?.config ?? null;
  }

  listProviders(): EmbeddingProviderConfig[] {
    return Array.from(this.providers.values())
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
      .map(r => r.config);
  }

  getDefaultProviderId(): string | null {
    return this.defaultProviderId;
  }

  setDefault(id: string): void {
    if (!this.providers.has(id)) {
      throw new Error(`嵌入提供者 ${id} 未注册`);
    }
    this.defaultProviderId = id;
    logger.debug(`[EmbeddingRegistry] 设置默认嵌入提供者: ${id}`);
  }

  async getProvider(providerId?: string): Promise<BaseEmbeddingProvider> {
    const id = providerId ?? this.defaultProviderId;
    if (!id) {
      throw new Error('没有可用的嵌入提供者，请先注册至少一个提供者');
    }

    const registration = this.providers.get(id);
    if (!registration) {
      throw new Error(`嵌入提供者 ${id} 未注册`);
    }

    let instance = this.activeInstances.get(id);
    if (instance) {
      if (!instance.isReady()) {
        const initPromise = this.initializationPromises.get(id);
        if (initPromise) {
          await initPromise;
        }
      }
      return instance;
    }

    const initPromise = (async () => {
      instance = registration.factory();
      this.activeInstances.set(id, instance!);
      await instance!.init();
      logger.debug(`[EmbeddingRegistry] 嵌入提供者 ${id} 初始化完成`);
    })();

    this.initializationPromises.set(id, initPromise);

    try {
      await initPromise;
    } finally {
      this.initializationPromises.delete(id);
    }

    return instance!;
  }

  async embed(text: string, providerId?: string): Promise<EmbeddingResult> {
    const provider = await this.getProvider(providerId);
    const id = providerId ?? this.defaultProviderId!;
    const startTime = Date.now();

    try {
      const result = await provider.embed(text);
      const duration = Date.now() - startTime;
      this.updateStats(id, 1, 1, result.cached ? 1 : 0, duration);
      return result;
    } catch (err) {
      logger.error(`[EmbeddingRegistry] 嵌入失败 (${id}):`, err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  async embedBatch(texts: string[], providerId?: string): Promise<BatchEmbeddingResult> {
    if (texts.length === 0) {
      const id = providerId ?? this.defaultProviderId;
      const config = id ? this.getConfig(id) : null;
      return {
        embeddings: [],
        dimensions: config?.dimensions ?? 0,
        provider: id ?? 'unknown',
        model: config?.model ?? 'unknown',
        cachedCount: 0,
      };
    }

    const provider = await this.getProvider(providerId);
    const id = providerId ?? this.defaultProviderId!;
    const startTime = Date.now();

    try {
      const result = await provider.embedBatch(texts);
      const duration = Date.now() - startTime;
      this.updateStats(id, 1, texts.length, result.cachedCount, duration);
      return result;
    } catch (err) {
      logger.error(`[EmbeddingRegistry] 批量嵌入失败 (${id}):`, err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  getStats(providerId?: string): EmbeddingProviderStats | null {
    const id = providerId ?? this.defaultProviderId;
    if (!id) return null;
    return this.providerStats.get(id) ?? null;
  }

  getAllStats(): Record<string, EmbeddingProviderStats> {
    const result: Record<string, EmbeddingProviderStats> = {};
    for (const [id, stats] of this.providerStats) {
      result[id] = { ...stats };
    }
    return result;
  }

  private updateStats(
    providerId: string,
    calls: number,
    texts: number,
    cacheHits: number,
    durationMs: number
  ): void {
    const stats = this.providerStats.get(providerId);
    if (!stats) return;

    stats.totalCalls += calls;
    stats.totalTexts += texts;
    stats.cacheHits += cacheHits;
    stats.cacheMisses += texts - cacheHits;
    stats.totalDurationMs += durationMs;
    stats.avgDurationMs = stats.totalCalls > 0 ? stats.totalDurationMs / stats.totalCalls : 0;
    stats.lastCalledAt = Date.now();
  }

  async dispose(): Promise<void> {
    for (const [id, instance] of this.activeInstances) {
      try {
        await instance.dispose();
      } catch (err) {
        logger.error(`[EmbeddingRegistry] 销毁 ${id} 失败:`, err);
      }
    }
    this.activeInstances.clear();
    this.initializationPromises.clear();
    logger.debug('[EmbeddingRegistry] 所有嵌入提供者已释放');
  }

  clear(): void {
    this.providers.clear();
    this.defaultProviderId = null;
    this.activeInstances.clear();
    this.initializationPromises.clear();
    this.providerStats.clear();
  }
}

const globalEmbeddingRegistry = new EmbeddingProviderRegistry();

export { EmbeddingProviderRegistry, globalEmbeddingRegistry };
export default globalEmbeddingRegistry;

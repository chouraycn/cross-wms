// 定义生命周期拥有的缓存原语，用于插件元数据。
//
// 移植自 openclaw/src/plugins/plugin-cache-primitives.ts。
//
// 降级策略：
//  - 原文件依赖 ../config/types.openclaw.js 的 OpenClawConfig 类型。
//    cross-wms 尚未移植该模块。这里使用 Record<string, unknown> 作为
//    最小占位类型，与 cross-wms 其他已移植模块的降级约定一致。
//  - 行为与 openclaw 原版一致：基于 Map 的 LRU 缓存、config-scoped 缓存与
//    config-scoped promise 加载器。

/** 缓存查找结果形状，用于区分 miss 与缓存的 undefined。 */
export type PluginLruCacheResult<T> = { hit: true; value: T } | { hit: false };

/** OpenClawConfig 降级占位类型，仅用作 WeakMap 键。 */
type OpenClawConfig = Record<string, unknown>;

/** 用于稳定插件元数据和加载器工件的小型进程本地 LRU 缓存。 */
export class PluginLruCache<T> {
  readonly #defaultMaxEntries: number;
  #maxEntries: number;
  readonly #entries = new Map<string, T>();

  constructor(defaultMaxEntries: number) {
    this.#defaultMaxEntries = normalizeMaxEntries(defaultMaxEntries, 1);
    this.#maxEntries = this.#defaultMaxEntries;
  }

  get maxEntries(): number {
    return this.#maxEntries;
  }

  get size(): number {
    return this.#entries.size;
  }

  setMaxEntriesForTest(value?: number): void {
    this.#maxEntries =
      typeof value === "number"
        ? normalizeMaxEntries(value, this.#defaultMaxEntries)
        : this.#defaultMaxEntries;
    this.#evictOldestEntries();
  }

  clear(): void {
    this.#entries.clear();
  }

  /** 返回缓存值并在存在时刷新其最近性。 */
  get(cacheKey: string): T | undefined {
    const cached = this.getResult(cacheKey);
    return cached.hit ? cached.value : undefined;
  }

  /** 返回 hit/miss 结果，并将 hit 提升到最新 LRU 位置。 */
  getResult(cacheKey: string): PluginLruCacheResult<T> {
    if (!this.#entries.has(cacheKey)) {
      return { hit: false };
    }
    const cached = this.#entries.get(cacheKey) as T;
    this.#entries.delete(cacheKey);
    this.#entries.set(cacheKey, cached);
    return { hit: true, value: cached };
  }

  /** 存储值作为最新条目并淘汰超过容量的最旧条目。 */
  set(cacheKey: string, value: T): void {
    if (this.#entries.has(cacheKey)) {
      this.#entries.delete(cacheKey);
    }
    this.#entries.set(cacheKey, value);
    this.#evictOldestEntries();
  }

  #evictOldestEntries(): void {
    while (this.#entries.size > this.#maxEntries) {
      const oldestEntry = this.#entries.keys().next();
      if (oldestEntry.done) {
        break;
      }
      this.#entries.delete(oldestEntry.value);
    }
  }
}

/** 按 config 对象身份分区的运行时缓存，避免 request-scoped config 冲突。 */
export type ConfigScopedRuntimeCache<T> = WeakMap<OpenClawConfig, Map<string, T>>;

/** 合并并发加载的 promise 加载器，按 config 对象与默认范围分组。 */
export type ConfigScopedPromiseLoader<T> = {
  load(config?: OpenClawConfig): Promise<T>;
  clear(): void;
};

/** 解析 config-scoped 缓存值；无 config 调用刻意绕过缓存。 */
export function resolveConfigScopedRuntimeCacheValue<T>(params: {
  cache: ConfigScopedRuntimeCache<T>;
  config?: OpenClawConfig;
  key: string;
  load: () => T;
}): T {
  if (!params.config) {
    return params.load();
  }
  let configCache = params.cache.get(params.config);
  if (!configCache) {
    configCache = new Map();
    params.cache.set(params.config, configCache);
  }
  if (configCache.has(params.key)) {
    return configCache.get(params.key) as T;
  }
  const loaded = params.load();
  configCache.set(params.key, loaded);
  return loaded;
}

/** 编码结构化缓存维度，无分隔符歧义。 */
export function createPluginCacheKey(parts: readonly unknown[]): string {
  return JSON.stringify(parts);
}

/** 创建 config-scoped promise 缓存，丢弃被拒绝的加载以便调用方重试。 */
export function createConfigScopedPromiseLoader<T>(
  load: (config?: OpenClawConfig) => T | Promise<T>,
): ConfigScopedPromiseLoader<T> {
  let defaultPromise: Promise<T> | undefined;
  let promisesByConfig = new WeakMap<OpenClawConfig, Promise<T>>();

  const createPromise = (config?: OpenClawConfig): Promise<T> => {
    const promise = Promise.resolve().then(() => load(config));
    void promise.catch(() => {
      if (config) {
        promisesByConfig.delete(config);
      } else if (defaultPromise === promise) {
        defaultPromise = undefined;
      }
    });
    return promise;
  };

  return {
    async load(config?: OpenClawConfig): Promise<T> {
      if (!config) {
        defaultPromise ??= createPromise();
        return await defaultPromise;
      }
      const cached = promisesByConfig.get(config);
      if (cached) {
        return await cached;
      }
      const promise = createPromise(config);
      promisesByConfig.set(config, promise);
      return await promise;
    },
    clear(): void {
      defaultPromise = undefined;
      promisesByConfig = new WeakMap<OpenClawConfig, Promise<T>>();
    },
  };
}

function normalizeMaxEntries(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.max(1, Math.floor(value));
}

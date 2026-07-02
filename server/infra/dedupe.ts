/**
 * 去重缓存模块 — 基于 TTL + LRU 的键去重缓存
 *
 * 参考自 OpenClaw 的 infra/dedupe.ts 设计。
 *
 * 实现要点：
 * - 使用 Map 维护键与过期时间戳，利用 Map 的插入顺序特性实现 LRU
 * - check() 会刷新 recency（将命中的键移动到最近位置）
 * - peek() 仅查询，不刷新 recency
 * - 过期条目在访问时惰性清理（不依赖定时器，避免后台任务开销）
 * - 超过 maxSize 时淘汰最久未访问的条目
 *
 * 适用场景：
 * - 消息去重（防止短时间内重复处理同一消息）
 * - 事件去重、请求幂等性校验
 */

// ===================== 类型定义 =====================

/**
 * 去重缓存接口。
 * T 为保留的类型参数，便于上层语义化标注（缓存仅记录键，不存储值）。
 */
export interface DedupeCache<T = unknown> {
  /**
   * 检查键是否存在。命中时刷新 recency（LRU 更新），并清理过期条目。
   * @returns 存在且未过期返回 true，否则 false
   */
  check: (key: string) => boolean;
  /**
   * 查看键是否存在，不刷新 recency，不清理过期条目。
   * @returns 存在且未过期返回 true，否则 false
   */
  peek: (key: string) => boolean;
  /** 写入一个键，刷新其 TTL 与 recency。超出 maxSize 时淘汰最旧条目。 */
  set: (key: string) => void;
  /** 主动删除一个键。 */
  delete: (key: string) => void;
  /** 清空所有条目。 */
  clear: () => void;
  /** 当前缓存条目数（含可能已过期但未惰性清理的条目）。 */
  readonly size: number;
}

/**
 * 创建去重缓存的配置项。
 */
export interface DedupeCacheOptions {
  /** 单个条目的存活时间（毫秒），默认 60000 */
  ttlMs?: number;
  /** 最大条目数，超过则按 LRU 淘汰，默认 1000 */
  maxSize?: number;
}

// ===================== 默认配置 =====================

/** 默认 TTL（毫秒） */
const DEFAULT_TTL_MS = 60000;
/** 默认最大条目数 */
const DEFAULT_MAX_SIZE = 1000;

// ===================== 核心实现 =====================

/**
 * 创建一个去重缓存实例。
 *
 * @param options 可选配置（ttlMs / maxSize）
 * @returns 去重缓存实例
 */
export function createDedupeCache<T = unknown>(
  options?: DedupeCacheOptions
): DedupeCache<T> {
  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
  const maxSize = options?.maxSize ?? DEFAULT_MAX_SIZE;

  // Map 的 value 存储该键的过期时间戳（毫秒）。
  // Map 按插入顺序遍历，最近访问/写入的键位于迭代末尾，从而实现 LRU。
  const store = new Map<string, number>();

  /**
   * 获取当前时间戳（毫秒）。
   */
  const nowMs = (): number => Date.now();

  /**
   * 判断条目是否已过期。
   */
  const isExpired = (expireAt: number): boolean => nowMs() >= expireAt;

  /**
   * 惰性清理单个键：若已过期则删除并返回 true。
   */
  const lazyEvict = (key: string): boolean => {
    const expireAt = store.get(key);
    if (expireAt === undefined) {
      return false;
    }
    if (isExpired(expireAt)) {
      store.delete(key);
      return true;
    }
    return false;
  };

  /**
   * 当条目数超过 maxSize 时，淘汰最久未访问的条目（Map 迭代首项）。
   */
  const evictIfOverCapacity = (): void => {
    while (store.size > maxSize) {
      const oldestKey = store.keys().next().value;
      if (oldestKey === undefined) break;
      store.delete(oldestKey);
    }
  };

  return {
    /**
     * 检查键是否存在并刷新 recency。
     * 命中（存在且未过期）时，先删除再重新插入以移动到迭代末尾（最近位置）。
     */
    check(key: string): boolean {
      const expireAt = store.get(key);
      if (expireAt === undefined) {
        return false;
      }
      // 过期则惰性清理
      if (isExpired(expireAt)) {
        store.delete(key);
        return false;
      }
      // 刷新 recency：删除后重新插入，使其成为最近访问
      store.delete(key);
      store.set(key, expireAt);
      return true;
    },

    /**
     * 查看键是否存在，不修改 recency，不主动清理。
     */
    peek(key: string): boolean {
      const expireAt = store.get(key);
      if (expireAt === undefined) {
        return false;
      }
      if (isExpired(expireAt)) {
        // peek 不刷新 recency，但过期条目视为不存在
        return false;
      }
      return true;
    },

    /**
     * 写入键，设置新的过期时间并刷新 recency。
     * 若已存在则先删除再插入（更新到最近位置）。
     */
    set(key: string): void {
      // 先删除以更新插入顺序（若已存在）
      store.delete(key);
      store.set(key, nowMs() + ttlMs);
      evictIfOverCapacity();
    },

    /**
     * 主动删除键。
     */
    delete(key: string): void {
      store.delete(key);
    },

    /**
     * 清空所有条目。
     */
    clear(): void {
      store.clear();
    },

    /**
     * 当前条目数（含未惰性清理的过期条目）。
     */
    get size(): number {
      return store.size;
    },
  };
}

// ===================== 全局共享实例 =====================

/**
 * 全局去重缓存使用的 Symbol 键。
 * 使用 Symbol.for 确保跨模块/跨引用共享同一 Symbol。
 */
const GLOBAL_DEDUPE_CACHE_KEY = Symbol.for('openclaw-dedupe-cache');

/**
 * 全局去重缓存宿主类型：扩展 Global 以挂载缓存实例。
 */
interface DedupeCacheGlobal {
  [GLOBAL_DEDUPE_CACHE_KEY]?: DedupeCache<unknown>;
}

/**
 * 解析（或首次创建）全局共享的去重缓存实例。
 *
 * 使用 `Symbol.for('openclaw-dedupe-cache')` 作为全局键，
 * 确保在同一个进程内跨模块引用拿到的是同一个实例。
 *
 * @returns 全局共享的去重缓存实例
 */
export function resolveGlobalDedupeCache(): DedupeCache<unknown> {
  const globalObj = globalThis as unknown as DedupeCacheGlobal;
  if (!globalObj[GLOBAL_DEDUPE_CACHE_KEY]) {
    globalObj[GLOBAL_DEDUPE_CACHE_KEY] = createDedupeCache<unknown>();
  }
  return globalObj[GLOBAL_DEDUPE_CACHE_KEY]!;
}

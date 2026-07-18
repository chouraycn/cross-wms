// 按 scope 分区的 TTL 缓存，用于在不跨分区污染的前提下抑制重复 id
/** 按 scope 的 TTL 缓存 */
export type ScopedExpiringIdCache<TScope extends string | number, TId extends string | number> = {
  /** 在指定时间或当前时间记录一个 scope 的 id */
  record: (scope: TScope, id: TId, now?: number) => void;
  /** id 仍在且在包含 TTL 窗口内时返回 true */
  has: (scope: TScope, id: TId, now?: number) => boolean;
  /** 清空所有 scope 与 id */
  clear: () => void;
};

function resolveNonNegativeInteger(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}

/** 创建一个按 scope 的 TTL 缓存，每个 scope 独立过期 */
export function createScopedExpiringIdCache<
  TScope extends string | number,
  TId extends string | number,
>(options: {
  /** 由调用方提供的后端存储，便于模块/测试管理生命周期 */
  store: Map<string, Map<string, number>>;
  /** TTL（毫秒）；非有限值视为立即过期 */
  ttlMs: number;
  /** 触发 opportunistic 清理的 scope 大小阈值 */
  cleanupThreshold: number;
}): ScopedExpiringIdCache<TScope, TId> {
  const ttlMs = resolveNonNegativeInteger(options.ttlMs, 0);
  const cleanupThreshold = Math.max(1, resolveNonNegativeInteger(options.cleanupThreshold, 1));

  function cleanupExpired(scopeKey: string, entry: Map<string, number>, now: number): void {
    for (const [id, timestamp] of entry) {
      // 相等仍视为存活，让调用方可以视 ttlMs 为包含年龄上限
      if (now - timestamp > ttlMs) {
        entry.delete(id);
      }
    }
    if (entry.size === 0) {
      options.store.delete(scopeKey);
    }
  }

  return {
    record: (scope, id, now = Date.now()) => {
      const scopeKey = String(scope);
      const idKey = String(id);
      let entry = options.store.get(scopeKey);
      if (!entry) {
        entry = new Map<string, number>();
        options.store.set(scopeKey, entry);
      }
      entry.set(idKey, now);
      if (entry.size > cleanupThreshold) {
        // 在 scope 增长超过调用方期望的稳态之前不扫描
        cleanupExpired(scopeKey, entry, now);
      }
    },
    has: (scope, id, now = Date.now()) => {
      const scopeKey = String(scope);
      const idKey = String(id);
      const entry = options.store.get(scopeKey);
      if (!entry) {
        return false;
      }
      cleanupExpired(scopeKey, entry, now);
      return entry.has(idKey);
    },
    clear: () => {
      options.store.clear();
    },
  };
}

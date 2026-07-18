/**
 * 进程级单例辅助 — 用于注册表、缓存和 SDK 可见的共享状态
 *
 * 键必须为 symbol，以避免无关模块在 globalThis 上发生属性名冲突。
 *
 * 参考 openclaw/src/shared/global-singleton.ts
 */

/** 解析进程级单例，用于可容忍 helper lookup 的缓存和注册表 */
export function resolveGlobalSingleton<T>(key: symbol, create: () => T): T {
  const globalStore = globalThis as Record<PropertyKey, unknown>;
  if (Object.hasOwn(globalStore, key)) {
    return globalStore[key] as T;
  }
  const created = create();
  globalStore[key] = created;
  return created;
}

/** 解析进程级 Map 单例，用于基于 globalThis 的键控缓存 */
export function resolveGlobalMap<TKey, TValue>(key: symbol): Map<TKey, TValue> {
  return resolveGlobalSingleton(key, () => new Map<TKey, TValue>());
}

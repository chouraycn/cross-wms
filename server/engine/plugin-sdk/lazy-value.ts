/**
 * 惰性缓存值 — 将值或值生成函数封装为至多解析一次的 getter
 *
 * 参考 openclaw/src/plugin-sdk/lazy-value.ts
 */

type LazyValue<T> = T | (() => T);

/** 返回一个至多解析一次的 getter（无 fallback 版本，可为 undefined）。 */
export function createCachedLazyValueGetter<T>(value: LazyValue<T>): () => T;
/** 返回一个至多解析一次的 getter（值为 nullish 时使用 fallback）。 */
export function createCachedLazyValueGetter<T>(
  value: LazyValue<T | null | undefined>,
  fallback: T,
): () => T;
export function createCachedLazyValueGetter<T>(
  value: LazyValue<T | null | undefined>,
  fallback?: T,
): () => T | undefined {
  let resolved = false;
  let cached: T | undefined;

  return () => {
    if (!resolved) {
      const nextValue =
        typeof value === 'function' ? (value as () => T | null | undefined)() : value;
      cached = nextValue ?? fallback;
      resolved = true;
    }
    return cached;
  };
}

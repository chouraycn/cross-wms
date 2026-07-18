/**
 * Map 大小限制 — 按插入顺序修剪 Map 直到符合最大大小
 * 参考 openclaw/src/infra/map-size.ts
 */

/** 按插入顺序修剪 Map，直到符合请求的最大大小 */
export function pruneMapToMaxSize<K, V>(map: Map<K, V>, maxSize: number): void {
  if (Number.isNaN(maxSize) || maxSize === Number.POSITIVE_INFINITY) {
    // 将"未知"或无限大小视为 no-op，使调用方可直接连接可选上限。
    return;
  }
  const limit = Math.max(0, Math.floor(maxSize));
  if (limit <= 0) {
    map.clear();
    return;
  }

  while (map.size > limit) {
    // Map 迭代按插入顺序；删除第一个键保留最新跟踪的条目，
    // 用于 request/memory 守卫缓存。
    const oldest = map.keys().next();
    if (oldest.done) {
      break;
    }
    map.delete(oldest.value);
  }
}

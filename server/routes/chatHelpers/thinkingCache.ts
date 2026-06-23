// v2.2.0: Thinking 结果缓存（LRU，最多 50 条，TTL 10 分钟）
const thinkingCache = new Map<string, { content: string; thinking: string; timestamp: number }>();
const THINKING_CACHE_MAX = 50;
const THINKING_CACHE_TTL = 10 * 60 * 1000; // 10 分钟

function getThinkingCacheKey(model: string, message: string): string {
  const str = `${model}:${message}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
}

function getThinkingCache(key: string): { content: string; thinking: string } | null {
  const entry = thinkingCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > THINKING_CACHE_TTL) {
    thinkingCache.delete(key);
    return null;
  }
  return { content: entry.content, thinking: entry.thinking };
}

function setThinkingCache(key: string, content: string, thinking: string): void {
  if (thinkingCache.size >= THINKING_CACHE_MAX) {
    const oldest = [...thinkingCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
    if (oldest) thinkingCache.delete(oldest[0]);
  }
  thinkingCache.set(key, { content, thinking, timestamp: Date.now() });
}

export { getThinkingCacheKey, getThinkingCache, setThinkingCache };

/**
 * SchemaCache — 基于 schema 内容哈希的内存缓存
 *
 * 用于缓存已生成的 JSON Schema / UI hints，避免重复计算
 */

import crypto from 'node:crypto';

export class SchemaCache {
  private cache = new Map<string, unknown>();
  private hashCache = new Map<string, string>();

  /**
   * 计算 schema 对象的稳定哈希（SHA-256）
   */
  getSchemaHash(schema: unknown): string {
    const json = stableStringify(schema);
    return crypto.createHash('sha256').update(json).digest('hex');
  }

  /**
   * 判断给定的 hash 是否与当前缓存一致
   */
  isCacheValid(hash: string): boolean {
    return this.hashCache.has(hash);
  }

  /**
   * 存入缓存：以 hash 为 key，保留值
   */
  set<T>(hash: string, value: T): void {
    this.cache.set(hash, value);
    this.hashCache.set(hash, hash);
  }

  /**
   * 按 hash 读取缓存值
   */
  get<T>(hash: string): T | undefined {
    return this.cache.get(hash) as T | undefined;
  }

  /**
   * 清除全部缓存
   */
  clear(): void {
    this.cache.clear();
    this.hashCache.clear();
  }

  /**
   * 获取当前缓存条目数
   */
  size(): number {
    return this.cache.size;
  }
}

/**
 * 稳定 JSON 序列化：键名按字母序排列，确保相同结构产生相同字符串
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const pairs = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
  return '{' + pairs.join(',') + '}';
}

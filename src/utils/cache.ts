import { useState, useEffect, useCallback, useRef } from 'react';

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  expireAt?: number;
}

export class MemoryCache<T = unknown> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private defaultTTL: number;

  constructor(defaultTTL: number = 5 * 60 * 1000) {
    this.defaultTTL = defaultTTL;
  }

  set(key: string, value: T, ttl?: number): void {
    const now = Date.now();
    const expireAt = ttl !== undefined ? now + ttl : now + this.defaultTTL;
    this.cache.set(key, {
      value,
      timestamp: now,
      expireAt,
    });
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    if (entry.expireAt && entry.expireAt < Date.now()) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    if (entry.expireAt && entry.expireAt < Date.now()) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    this.cleanupExpired();
    return this.cache.size;
  }

  keys(): string[] {
    this.cleanupExpired();
    return Array.from(this.cache.keys());
  }

  values(): T[] {
    this.cleanupExpired();
    return Array.from(this.cache.values()).map(entry => entry.value);
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expireAt && entry.expireAt < now) {
        this.cache.delete(key);
      }
    }
  }
}

type LRUNode<T> = {
  key: string;
  value: T;
  prev: LRUNode<T> | null;
  next: LRUNode<T> | null;
  expireAt?: number;
};

export class LRUCache<T = unknown> {
  private capacity: number;
  private cache: Map<string, LRUNode<T>> = new Map();
  private head: LRUNode<T> | null = null;
  private tail: LRUNode<T> | null = null;
  private defaultTTL: number;

  constructor(capacity: number = 100, defaultTTL: number = 5 * 60 * 1000) {
    this.capacity = capacity;
    this.defaultTTL = defaultTTL;
  }

  get(key: string): T | undefined {
    const node = this.cache.get(key);
    if (!node) {
      return undefined;
    }

    if (node.expireAt && node.expireAt < Date.now()) {
      this.removeNode(node);
      this.cache.delete(key);
      return undefined;
    }

    this.moveToHead(node);
    return node.value;
  }

  set(key: string, value: T, ttl?: number): void {
    const existing = this.cache.get(key);
    const now = Date.now();
    const expireAt = ttl !== undefined ? now + ttl : now + this.defaultTTL;

    if (existing) {
      existing.value = value;
      existing.expireAt = expireAt;
      this.moveToHead(existing);
      return;
    }

    const newNode: LRUNode<T> = {
      key,
      value,
      prev: null,
      next: null,
      expireAt,
    };

    this.cache.set(key, newNode);
    this.addToHead(newNode);

    if (this.cache.size > this.capacity) {
      this.evictLRU();
    }
  }

  has(key: string): boolean {
    const node = this.cache.get(key);
    if (!node) {
      return false;
    }

    if (node.expireAt && node.expireAt < Date.now()) {
      this.removeNode(node);
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  delete(key: string): boolean {
    const node = this.cache.get(key);
    if (!node) {
      return false;
    }

    this.removeNode(node);
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.head = null;
    this.tail = null;
  }

  get size(): number {
    this.cleanupExpired();
    return this.cache.size;
  }

  keys(): string[] {
    this.cleanupExpired();
    const keys: string[] = [];
    let current = this.head;
    while (current) {
      keys.push(current.key);
      current = current.next;
    }
    return keys;
  }

  values(): T[] {
    this.cleanupExpired();
    const values: T[] = [];
    let current = this.head;
    while (current) {
      values.push(current.value);
      current = current.next;
    }
    return values;
  }

  private addToHead(node: LRUNode<T>): void {
    node.prev = null;
    node.next = this.head;

    if (this.head) {
      this.head.prev = node;
    }
    this.head = node;

    if (!this.tail) {
      this.tail = node;
    }
  }

  private removeNode(node: LRUNode<T>): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }
  }

  private moveToHead(node: LRUNode<T>): void {
    this.removeNode(node);
    this.addToHead(node);
  }

  private evictLRU(): void {
    if (!this.tail) {
      return;
    }

    const lruKey = this.tail.key;
    this.removeNode(this.tail);
    this.cache.delete(lruKey);
  }

  private cleanupExpired(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, node] of this.cache.entries()) {
      if (node.expireAt && node.expireAt < now) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      const node = this.cache.get(key);
      if (node) {
        this.removeNode(node);
        this.cache.delete(key);
      }
    }
  }
}

interface UseCacheOptions<T> {
  initialData?: T;
  ttl?: number;
  cacheKey?: string;
}

const globalCache = new LRUCache<unknown>(200);

export function useCache<T>(
  key: string,
  fetcher: () => Promise<T> | T,
  options: UseCacheOptions<T> = {}
): {
  data: T | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  clearCache: () => void;
} {
  const { initialData, ttl, cacheKey } = options;
  const effectiveKey = cacheKey ?? key;

  const [data, setData] = useState<T | undefined>(initialData);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const fetcherRef = useRef(fetcher);

  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const cached = globalCache.get(effectiveKey);
      if (cached !== undefined) {
        setData(cached as T);
        setIsLoading(false);
        return;
      }

      const result = await fetcherRef.current();
      globalCache.set(effectiveKey, result, ttl);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [effectiveKey, ttl]);

  const refetch = useCallback(async () => {
    globalCache.delete(effectiveKey);
    await loadData();
  }, [effectiveKey, loadData]);

  const clearCache = useCallback(() => {
    globalCache.delete(effectiveKey);
    setData(undefined);
  }, [effectiveKey]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    data,
    isLoading,
    error,
    refetch,
    clearCache,
  };
}

export { globalCache };

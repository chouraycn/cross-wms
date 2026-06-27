/**
 * Runtime Cache
 * 运行时句柄缓存 - 追踪和管理 ACP 运行时句柄
 */

import type { CachedRuntimeState, SessionAcpMeta } from "./types.js";

interface CacheEntry {
  state: CachedRuntimeState;
}

/**
 * Map-backed cache that tracks last-touch time per actor key.
 */
export class RuntimeCache {
  private readonly cache = new Map<string, CacheEntry>();

  size(): number {
    return this.cache.size;
  }

  has(actorKey: string): boolean {
    return this.cache.has(actorKey.toLowerCase().trim());
  }

  get(
    actorKey: string,
    params: {
      touch?: boolean;
      now?: number;
    } = {},
  ): CachedRuntimeState | null {
    const key = actorKey.toLowerCase().trim();
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }
    if (params.touch !== false) {
      entry.state.lastTouchedAt = params.now ?? Date.now();
    }
    return entry.state;
  }

  peek(actorKey: string): CachedRuntimeState | null {
    return this.get(actorKey, { touch: false });
  }

  getLastTouchedAt(actorKey: string): number | null {
    const entry = this.cache.get(actorKey.toLowerCase().trim());
    return entry?.state.lastTouchedAt ?? null;
  }

  set(
    actorKey: string,
    state: CachedRuntimeState,
    params: {
      now?: number;
    } = {},
  ): void {
    const key = actorKey.toLowerCase().trim();
    this.cache.set(key, {
      state: {
        ...state,
        lastTouchedAt: params.now ?? Date.now(),
      },
    });
  }

  clear(actorKey: string): void {
    this.cache.delete(actorKey.toLowerCase().trim());
  }

  clearIfHandleMatches(actorKey: string, handleId: string): boolean {
    const key = actorKey.toLowerCase().trim();
    const entry = this.cache.get(key);
    if (entry && entry.state.handle.id === handleId) {
      this.cache.delete(key);
      return true;
    }
    return false;
  }

  snapshot(params: { now?: number } = {}): Array<{
    actorKey: string;
    state: CachedRuntimeState;
    lastTouchedAt: number;
    idleMs: number;
  }> {
    const now = params.now ?? Date.now();
    const entries: Array<{
      actorKey: string;
      state: CachedRuntimeState;
      lastTouchedAt: number;
      idleMs: number;
    }> = [];
    for (const [actorKey, entry] of Array.from(this.cache.entries())) {
      entries.push({
        actorKey,
        state: entry.state,
        lastTouchedAt: entry.state.lastTouchedAt,
        idleMs: Math.max(0, now - entry.state.lastTouchedAt),
      });
    }
    return entries;
  }

  collectIdleCandidates(params: { maxIdleMs: number; now?: number }): Array<{
    actorKey: string;
    state: CachedRuntimeState;
    lastTouchedAt: number;
    idleMs: number;
  }> {
    if (!Number.isFinite(params.maxIdleMs) || params.maxIdleMs <= 0) {
      return [];
    }
    const now = params.now ?? Date.now();
    return this.snapshot({ now }).filter((entry) => entry.idleMs >= params.maxIdleMs);
  }

  /**
   * Get cache observability snapshot
   */
  getObservabilitySnapshot(): {
    size: number;
    entries: Array<{
      actorKey: string;
      backend: string;
      agent: string;
      mode: string;
      idleMs: number;
    }>;
  } {
    const now = Date.now();
    const entries: Array<{
      actorKey: string;
      backend: string;
      agent: string;
      mode: string;
      idleMs: number;
    }> = [];
    for (const [actorKey, entry] of Array.from(this.cache.entries())) {
      entries.push({
        actorKey,
        backend: entry.state.backend,
        agent: entry.state.agent,
        mode: entry.state.mode,
        idleMs: Math.max(0, now - entry.state.lastTouchedAt),
      });
    }
    return {
      size: this.cache.size,
      entries,
    };
  }
}

/**
 * Runtime handle cache with session-specific tracking
 */
export class RuntimeHandleCache {
  private readonly cache = new RuntimeCache();
  private readonly handleToSession = new Map<string, string>();

  size(): number {
    return this.cache.size();
  }

  has(sessionKey: string): boolean {
    return this.cache.has(sessionKey);
  }

  get(sessionKey: string): CachedRuntimeState | null {
    return this.cache.get(sessionKey);
  }

  peek(sessionKey: string): CachedRuntimeState | null {
    return this.cache.peek(sessionKey);
  }

  set(
    sessionKey: string,
    state: CachedRuntimeState & { lastTouchedAt?: number },
  ): void {
    this.cache.set(sessionKey, {
      ...state,
      lastTouchedAt: state.lastTouchedAt ?? Date.now(),
    });
  }

  clear(sessionKey: string): void {
    const entry = this.cache.get(sessionKey);
    if (entry) {
      this.handleToSession.delete(entry.handle.id);
    }
    this.cache.clear(sessionKey);
  }

  clearIfHandleMatches(params: { sessionKey: string; handle: { id: string } }): boolean {
    const sessionKey = params.sessionKey.toLowerCase().trim();
    const entry = this.cache.get(sessionKey);
    if (entry && entry.handle.id === params.handle.id) {
      this.handleToSession.delete(params.handle.id);
      this.cache.clear(sessionKey);
      return true;
    }
    return false;
  }

  async evictIdle(params: {
    cfg: unknown;
    maxIdleMs: number;
    actorQueue: { getTotalPendingCount(): number };
    activeTurnBySession: Map<string, unknown>;
  }): Promise<void> {
    const candidates = this.cache.collectIdleCandidates({
      maxIdleMs: params.maxIdleMs,
    });

    for (const candidate of candidates) {
      const sessionKey = candidate.actorKey;
      // Don't evict if there are pending operations or active turns
      if (
        params.actorQueue.getTotalPendingCount() > 0 ||
        params.activeTurnBySession.has(sessionKey.toLowerCase())
      ) {
        continue;
      }

      // Close the runtime handle
      try {
        await candidate.state.runtime.close({
          handle: candidate.state.handle,
          reason: "idle-eviction",
        });
      } catch (error) {
        console.warn(`Failed to close idle runtime for ${sessionKey}:`, error);
      }

      this.cache.clear(sessionKey);
    }
  }

  getObservabilitySnapshot(): ReturnType<RuntimeCache["getObservabilitySnapshot"]> {
    return this.cache.getObservabilitySnapshot();
  }
}

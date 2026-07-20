/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/session-manager-cache.ts
 *
 * Caches and prewarms session managers used by embedded-agent runs.
 * cross-wms 简化实现：提供基本的 session manager 缓存。
 */

import fs from "node:fs/promises";
import { Buffer } from "node:buffer";

const DEFAULT_SESSION_MANAGER_TTL_MS = 45_000;

type SessionManagerCache = {
  clear: () => void;
  isSessionManagerCached: (sessionFile: string) => boolean;
  keys: () => string[];
  prewarmSessionFile: (sessionFile: string) => Promise<void>;
  trackSessionManagerAccess: (sessionFile: string) => void;
};

function createSimpleExpiringCache(options?: { ttlMs?: number }) {
  const ttlMs = options?.ttlMs ?? DEFAULT_SESSION_MANAGER_TTL_MS;
  const cache = new Map<string, { value: true; expiresAt: number }>();
  const clock = () => Date.now();

  return {
    get(key: string): true | undefined {
      const entry = cache.get(key);
      if (!entry) {
        return undefined;
      }
      if (clock() > entry.expiresAt) {
        cache.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key: string, value: true): void {
      cache.set(key, { value, expiresAt: clock() + ttlMs });
    },
    clear(): void {
      cache.clear();
    },
    keys(): string[] {
      const now = clock();
      const validKeys: string[] = [];
      for (const [key, entry] of cache.entries()) {
        if (now <= entry.expiresAt) {
          validKeys.push(key);
        }
      }
      return validKeys;
    },
  };
}

export function createSessionManagerCache(options?: {
  ttlMs?: number | (() => number);
}): SessionManagerCache {
  const getTtlMs = () =>
    typeof options?.ttlMs === "function" ? options.ttlMs() : (options?.ttlMs ?? DEFAULT_SESSION_MANAGER_TTL_MS);
  const cache = createSimpleExpiringCache({ ttlMs: getTtlMs() });

  return {
    clear: () => {
      cache.clear();
    },
    isSessionManagerCached: (sessionFile) => cache.get(sessionFile) === true,
    keys: () => cache.keys(),
    prewarmSessionFile: async (sessionFile) => {
      if (cache.get(sessionFile) === true) {
        return;
      }
      try {
        const handle = await fs.open(sessionFile, "r");
        try {
          const buffer = Buffer.alloc(4096);
          await handle.read(buffer, 0, buffer.length, 0);
        } finally {
          await handle.close();
        }
        cache.set(sessionFile, true);
      } catch {
        // File doesn't exist yet, SessionManager will create it
      }
    },
    trackSessionManagerAccess: (sessionFile) => {
      cache.set(sessionFile, true);
    },
  };
}

const sessionManagerCache = createSessionManagerCache();

export function trackSessionManagerAccess(sessionFile: string): void {
  sessionManagerCache.trackSessionManagerAccess(sessionFile);
}

export async function prewarmSessionFile(sessionFile: string): Promise<void> {
  await sessionManagerCache.prewarmSessionFile(sessionFile);
}

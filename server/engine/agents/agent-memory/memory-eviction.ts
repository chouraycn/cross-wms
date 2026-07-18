import { logger } from '../../../logger.js';
import type { MemoryEntry, MemoryStoreConfig } from './types.js';
import { retrieveMemory, deleteMemory, countMemory } from './memory-manager.js';

export interface EvictionResult {
  evictedCount: number;
  remainingCount: number;
  policy: MemoryStoreConfig['evictionPolicy'];
}

export async function evictMemory(agentId: string, config: MemoryStoreConfig): Promise<EvictionResult> {
  const { maxEntries, maxAgeMs, evictionPolicy } = config;
  let evictedCount = 0;

  logger.debug(`[Agents:MemoryEviction] Running eviction for agent ${agentId} with policy ${evictionPolicy}`);

  const currentCount = await countMemory({ agentId });
  
  if (currentCount <= maxEntries) {
    logger.debug(`[Agents:MemoryEviction] No eviction needed: ${currentCount} <= ${maxEntries}`);
    return { evictedCount: 0, remainingCount: currentCount, policy: evictionPolicy };
  }

  const toEvict = currentCount - maxEntries;
  const entries = await retrieveMemory({ agentId, limit: currentCount });

  let candidates: MemoryEntry[];

  switch (evictionPolicy) {
    case 'ttl':
      candidates = entries
        .filter(e => e.expiresAt && e.expiresAt < Date.now())
        .sort((a, b) => (a.expiresAt ?? 0) - (b.expiresAt ?? 0));
      break;

    case 'fifo':
      candidates = [...entries].sort((a, b) => a.createdAt - b.createdAt);
      break;

    case 'lru':
    default:
      candidates = [...entries].sort((a, b) => a.updatedAt - b.updatedAt);
      break;
  }

  const expiredEntries = entries.filter(e => maxAgeMs > 0 && e.createdAt + maxAgeMs < Date.now());
  if (expiredEntries.length > 0) {
    candidates = [...expiredEntries, ...candidates.filter(e => !expiredEntries.includes(e))];
  }

  const toDelete = candidates.slice(0, toEvict);

  for (const entry of toDelete) {
    await deleteMemory(entry.id);
    evictedCount++;
  }

  const remainingCount = currentCount - evictedCount;

  logger.debug(`[Agents:MemoryEviction] Evicted ${evictedCount} entries, ${remainingCount} remaining`);

  return { evictedCount, remainingCount, policy: evictionPolicy };
}

export async function evictExpiredMemory(agentId: string): Promise<EvictionResult> {
  const entries = await retrieveMemory({ agentId });
  const now = Date.now();
  let evictedCount = 0;

  for (const entry of entries) {
    if (entry.expiresAt && entry.expiresAt < now) {
      await deleteMemory(entry.id);
      evictedCount++;
    }
  }

  const remainingCount = entries.length - evictedCount;

  logger.debug(`[Agents:MemoryEviction] Evicted ${evictedCount} expired entries for agent ${agentId}`);

  return {
    evictedCount,
    remainingCount,
    policy: 'ttl',
  };
}

export async function evictAllExpiredMemory(): Promise<{ evictedCount: number }> {
  const allEntries = await retrieveMemory({ agentId: '%' });
  const now = Date.now();
  let evictedCount = 0;

  for (const entry of allEntries) {
    if (entry.expiresAt && entry.expiresAt < now) {
      await deleteMemory(entry.id);
      evictedCount++;
    }
  }

  logger.debug(`[Agents:MemoryEviction] Evicted ${evictedCount} expired entries globally`);

  return { evictedCount };
}

export async function enforceRetentionPolicy(agentId: string, policy: {
  maxEntries: number;
  maxAgeMs: number;
}): Promise<EvictionResult> {
  const config: MemoryStoreConfig = {
    type: 'sqlite',
    maxEntries: policy.maxEntries,
    maxAgeMs: policy.maxAgeMs,
    evictionPolicy: 'ttl',
  };

  return evictMemory(agentId, config);
}

logger.debug('[Agents:MemoryEviction] Module loaded');
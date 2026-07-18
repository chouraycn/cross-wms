import { logger } from '../../../logger.js';
import type { MemoryEntry, MemoryStoreConfig, MemoryRetrievalOptions } from './types.js';
import { MemoryStoreConfigSchema } from './types.js';
import { MemoryStore, BaseMemoryStore } from './memory-store.js';
import { SqliteMemoryStore } from './memory-store.sqlite.js';

const stores = new Map<string, MemoryStore>();

export function createMemoryStore(config: MemoryStoreConfig): MemoryStore {
  const validated = MemoryStoreConfigSchema.parse(config);

  let store: MemoryStore;
  switch (validated.type) {
    case 'sqlite':
      store = new SqliteMemoryStore(validated);
      break;
    default:
      throw new Error(`Unsupported memory store type: ${validated.type}`);
  }

  logger.debug(`[Agents:MemoryManager] Created memory store: ${validated.type}`);
  return store;
}

export function registerMemoryStore(name: string, store: MemoryStore): void {
  stores.set(name, store);
  logger.debug(`[Agents:MemoryManager] Registered memory store: ${name}`);
}

export function getMemoryStore(name: string): MemoryStore | undefined {
  return stores.get(name);
}

export function getDefaultMemoryStore(): MemoryStore {
  const defaultStore = stores.get('default');
  if (defaultStore) {
    return defaultStore;
  }

  const store = createMemoryStore({ type: 'sqlite', path: ':memory:', maxEntries: 1000, maxAgeMs: 86400000, evictionPolicy: 'ttl' });
  registerMemoryStore('default', store);
  return store;
}

export async function initMemoryStore(name: string, config: MemoryStoreConfig): Promise<MemoryStore> {
  const store = createMemoryStore(config);
  await store.init();
  registerMemoryStore(name, store);
  return store;
}

export async function closeMemoryStore(name: string): Promise<void> {
  const store = stores.get(name);
  if (store) {
    await store.close();
    stores.delete(name);
    logger.debug(`[Agents:MemoryManager] Closed memory store: ${name}`);
  }
}

export async function closeAllMemoryStores(): Promise<void> {
  for (const [name, store] of stores) {
    await store.close();
  }
  stores.clear();
  logger.debug('[Agents:MemoryManager] Closed all memory stores');
}

export async function addMemory(entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'>, storeName = 'default'): Promise<MemoryEntry> {
  const store = getMemoryStore(storeName) ?? getDefaultMemoryStore();
  return store.add(entry);
}

export async function getMemory(id: string, storeName = 'default'): Promise<MemoryEntry | undefined> {
  const store = getMemoryStore(storeName) ?? getDefaultMemoryStore();
  return store.get(id);
}

export async function updateMemory(id: string, updates: Partial<Pick<MemoryEntry, 'content' | 'metadata' | 'tags' | 'relevanceScore' | 'expiresAt'>>, storeName = 'default'): Promise<MemoryEntry | undefined> {
  const store = getMemoryStore(storeName) ?? getDefaultMemoryStore();
  return store.update(id, updates);
}

export async function deleteMemory(id: string, storeName = 'default'): Promise<boolean> {
  const store = getMemoryStore(storeName) ?? getDefaultMemoryStore();
  return store.delete(id);
}

export async function retrieveMemory(options: MemoryRetrievalOptions, storeName = 'default'): Promise<MemoryEntry[]> {
  const store = getMemoryStore(storeName) ?? getDefaultMemoryStore();
  return store.retrieve(options);
}

export async function getAgentMemory(agentId: string, storeName = 'default'): Promise<MemoryEntry[]> {
  const store = getMemoryStore(storeName) ?? getDefaultMemoryStore();
  return store.getByAgent(agentId);
}

export async function getSessionMemory(sessionId: string, storeName = 'default'): Promise<MemoryEntry[]> {
  const store = getMemoryStore(storeName) ?? getDefaultMemoryStore();
  return store.getBySession(sessionId);
}

export async function countMemory(options?: { agentId?: string; sessionId?: string; type?: MemoryEntry['type'] }, storeName = 'default'): Promise<number> {
  const store = getMemoryStore(storeName) ?? getDefaultMemoryStore();
  return store.count(options);
}

export async function clearMemory(options?: { agentId?: string; sessionId?: string }, storeName = 'default'): Promise<void> {
  const store = getMemoryStore(storeName) ?? getDefaultMemoryStore();
  await store.clear(options);
}

logger.debug('[Agents:MemoryManager] Module loaded');
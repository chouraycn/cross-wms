export { MemoryEntrySchema, MemoryStoreConfigSchema } from './types.js';
export type { MemoryEntry, MemoryStoreConfig, MemoryRetrievalOptions, MemoryRetentionPolicy } from './types.js';

export { MemoryStore, BaseMemoryStore } from './memory-store.js';

export { SqliteMemoryStore } from './memory-store.sqlite.js';

export {
  createMemoryStore,
  registerMemoryStore,
  getMemoryStore,
  getDefaultMemoryStore,
  initMemoryStore,
  closeMemoryStore,
  closeAllMemoryStores,
  addMemory,
  getMemory,
  updateMemory,
  deleteMemory,
  retrieveMemory,
  getAgentMemory,
  getSessionMemory,
  countMemory,
  clearMemory,
} from './memory-manager.js';

export {
  searchMemory,
  getRecentMemory,
  getRelevantMemory,
  getMemoryByTags,
  getMemorySummary,
  getMemoryStats,
  type MemorySearchResult,
} from './memory-retrieval.js';

export {
  evictMemory,
  evictExpiredMemory,
  evictAllExpiredMemory,
  enforceRetentionPolicy,
  type EvictionResult,
} from './memory-eviction.js';
import type { MemoryEntry, MemoryStoreConfig, MemoryRetrievalOptions } from './types.js';

export interface MemoryStore {
  config: MemoryStoreConfig;

  init(): Promise<void>;
  close(): Promise<void>;

  add(entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<MemoryEntry>;
  get(id: string): Promise<MemoryEntry | undefined>;
  update(id: string, updates: Partial<Pick<MemoryEntry, 'content' | 'metadata' | 'tags' | 'relevanceScore' | 'expiresAt'>>): Promise<MemoryEntry | undefined>;
  delete(id: string): Promise<boolean>;

  retrieve(options: MemoryRetrievalOptions): Promise<MemoryEntry[]>;
  getByAgent(agentId: string): Promise<MemoryEntry[]>;
  getBySession(sessionId: string): Promise<MemoryEntry[]>;

  count(options?: { agentId?: string; sessionId?: string; type?: MemoryEntry['type'] }): Promise<number>;
  clear(options?: { agentId?: string; sessionId?: string }): Promise<void>;
}

export abstract class BaseMemoryStore implements MemoryStore {
  config: MemoryStoreConfig;

  constructor(config: MemoryStoreConfig) {
    this.config = config;
  }

  abstract init(): Promise<void>;
  abstract close(): Promise<void>;

  abstract add(entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<MemoryEntry>;
  abstract get(id: string): Promise<MemoryEntry | undefined>;
  abstract update(id: string, updates: Partial<Pick<MemoryEntry, 'content' | 'metadata' | 'tags' | 'relevanceScore' | 'expiresAt'>>): Promise<MemoryEntry | undefined>;
  abstract delete(id: string): Promise<boolean>;

  abstract retrieve(options: MemoryRetrievalOptions): Promise<MemoryEntry[]>;
  abstract getByAgent(agentId: string): Promise<MemoryEntry[]>;
  abstract getBySession(sessionId: string): Promise<MemoryEntry[]>;

  abstract count(options?: { agentId?: string; sessionId?: string; type?: MemoryEntry['type'] }): Promise<number>;
  abstract clear(options?: { agentId?: string; sessionId?: string }): Promise<void>;

  protected generateId(): string {
    return `mem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
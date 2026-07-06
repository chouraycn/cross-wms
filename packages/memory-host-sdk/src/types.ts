export type MemoryBackendType = 'sqlite-vec' | 'lancedb' | 'pinecone' | 'chroma' | 'weaviate' | 'memory';

export type MemoryScope = 'global' | 'workspace' | 'session' | 'user';

export interface MemoryEntry {
  id: number;
  text: string;
  metadata: Record<string, unknown>;
  embedding?: number[];
  createdAt: number;
  updatedAt: number;
  score?: number;
}

export interface MemorySearchResult {
  entry: MemoryEntry;
  score: number;
  rank: number;
}

export interface MemoryStats {
  totalEntries: number;
  totalBytes?: number;
  lastUpdated: number;
  backendType: MemoryBackendType;
  isHealthy: boolean;
  error?: string;
}

export interface MemoryBackendCapabilities {
  vectorSearch: boolean;
  fullTextSearch: boolean;
  metadataFilter: boolean;
  hybridSearch: boolean;
  batchInsert: boolean;
  streaming: boolean;
  persistence: boolean;
  transactions: boolean;
  multimodal: boolean;
}

export interface MemoryBackendConfig {
  type: MemoryBackendType;
  path?: string;
  url?: string;
  apiKey?: string;
  collection?: string;
  dimension?: number;
  metric?: 'cosine' | 'euclidean' | 'dotproduct';
  options?: Record<string, unknown>;
}

export interface MemoryQuery {
  text: string;
  topK?: number;
  filter?: Record<string, unknown>;
  scope?: MemoryScope;
  minScore?: number;
  maxScore?: number;
  rerank?: boolean;
  includeMetadata?: string[];
}

export interface MemoryInsertOptions {
  scope?: MemoryScope;
  tags?: string[];
  source?: string;
  ttl?: number;
  metadata?: Record<string, unknown>;
}

export interface MemoryBackend {
  type: MemoryBackendType;
  name: string;
  version: string;
  capabilities: MemoryBackendCapabilities;

  isAvailable(): boolean;
  init(config: MemoryBackendConfig): Promise<void>;
  shutdown?(): Promise<void>;

  insertMemory(text: string, metadata?: Record<string, unknown>): Promise<number>;
  insertBatch?(entries: Array<{ text: string; metadata?: Record<string, unknown> }>): Promise<number[]>;

  searchMemory(query: MemoryQuery): Promise<MemorySearchResult[]>;

  getMemory(id: number): Promise<MemoryEntry | null>;
  updateMemory?(id: number, updates: Partial<{ text: string; metadata: Record<string, unknown> }>): Promise<boolean>;
  deleteMemory(id: number): Promise<boolean>;
  deleteByFilter?(filter: Record<string, unknown>): Promise<number>;

  clearAll(): Promise<void>;
  getStats(): Promise<MemoryStats>;
  healthCheck?(): Promise<boolean>;
}

export type MemoryEventType =
  | 'memory_inserted'
  | 'memory_updated'
  | 'memory_deleted'
  | 'memory_searched'
  | 'cleared'
  | 'error';

export interface MemoryEvent {
  type: MemoryEventType;
  timestamp: number;
  data?: unknown;
}

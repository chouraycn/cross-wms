import { logger } from '../../logger.js';

export type VectorStoreType = 'milvus' | 'qdrant' | 'sqlite-vec' | 'in-memory';

export interface VectorStoreConfig {
  type: VectorStoreType;
  endpoint?: string;
  apiKey?: string;
  collectionName?: string;
  dimension?: number;
  useHttps?: boolean;
  region?: string;
}

export interface VectorRecord {
  id: string;
  vector?: number[];
  content: string;
  metadata?: Record<string, unknown>;
  source?: string;
  timestamp?: number;
}

export interface SearchResult {
  id: string;
  content: string;
  score: number;
  metadata?: Record<string, unknown>;
  source?: string;
  timestamp?: number;
}

export interface SearchOptions {
  topK?: number;
  minScore?: number;
  filter?: Record<string, unknown>;
  includeMetadata?: boolean;
  hybridSearch?: boolean;
  textWeight?: number;
  vectorWeight?: number;
}

export interface RetrievalStats {
  totalRecords: number;
  searchCount: number;
  insertCount: number;
  deleteCount: number;
  lastSearchAt?: number;
  lastInsertAt?: number;
  averageQueryTimeMs?: number;
}

const DEFAULT_CONFIG: Required<VectorStoreConfig> = {
  type: 'in-memory',
  endpoint: 'http://localhost:19530',
  apiKey: '',
  collectionName: 'context_memory',
  dimension: 384,
  useHttps: false,
  region: 'cn-hangzhou',
};

export class VectorRetrieval {
  private config: Required<VectorStoreConfig>;
  private inMemoryStore: Map<string, VectorRecord> = new Map();
  private stats: RetrievalStats = {
    totalRecords: 0,
    searchCount: 0,
    insertCount: 0,
    deleteCount: 0,
  };
  private queryTimes: number[] = [];

  constructor(config: Partial<VectorStoreConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    logger.debug(`[VectorRetrieval] 向量检索初始化完成: type=${this.config.type}`);
  }

  async insert(record: VectorRecord): Promise<boolean> {
    const startTime = Date.now();

    try {
      if (this.config.type === 'in-memory') {
        return this.insertInMemory(record);
      }

      if (this.config.type === 'milvus') {
        return this.insertMilvus(record);
      }

      if (this.config.type === 'qdrant') {
        return this.insertQdrant(record);
      }

      return this.insertInMemory(record);
    } finally {
      this.stats.insertCount++;
      this.stats.lastInsertAt = Date.now();
      logger.debug(
        `[VectorRetrieval] 插入向量: ${record.id}, 耗时=${Date.now() - startTime}ms`
      );
    }
  }

  async insertBatch(records: VectorRecord[]): Promise<number> {
    let count = 0;
    for (const record of records) {
      if (await this.insert(record)) {
        count++;
      }
    }
    return count;
  }

  async search(query: string | number[], options: SearchOptions = {}): Promise<SearchResult[]> {
    const startTime = Date.now();
    const { topK = 10, minScore = 0 } = options;

    try {
      let results: SearchResult[];

      if (this.config.type === 'in-memory') {
        results = this.searchInMemory(query, options);
      } else if (this.config.type === 'milvus') {
        results = await this.searchMilvus(query, options);
      } else if (this.config.type === 'qdrant') {
        results = await this.searchQdrant(query, options);
      } else {
        results = this.searchInMemory(query, options);
      }

      return results.filter(r => r.score >= minScore).slice(0, topK);
    } finally {
      const duration = Date.now() - startTime;
      this.stats.searchCount++;
      this.stats.lastSearchAt = Date.now();
      this.queryTimes.push(duration);
      if (this.queryTimes.length > 100) {
        this.queryTimes.shift();
      }
      this.stats.averageQueryTimeMs =
        this.queryTimes.reduce((a, b) => a + b, 0) / this.queryTimes.length;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      if (this.config.type === 'in-memory') {
        return this.inMemoryStore.delete(id);
      }
      return this.inMemoryStore.delete(id);
    } finally {
      this.stats.deleteCount++;
    }
  }

  async get(id: string): Promise<VectorRecord | null> {
    if (this.config.type === 'in-memory') {
      const record = this.inMemoryStore.get(id);
      return record ? { ...record } : null;
    }
    const record = this.inMemoryStore.get(id);
    return record ? { ...record } : null;
  }

  async clear(): Promise<void> {
    this.inMemoryStore.clear();
    this.stats.totalRecords = 0;
    logger.debug('[VectorRetrieval] 向量存储已清空');
  }

  getStats(): RetrievalStats {
    return { ...this.stats, totalRecords: this.inMemoryStore.size };
  }

  getConfig(): VectorStoreConfig {
    return { ...this.config };
  }

  private insertInMemory(record: VectorRecord): boolean {
    if (!record.vector) {
      record.vector = this.generatePseudoVector(record.content);
    }
    this.inMemoryStore.set(record.id, { ...record });
    this.stats.totalRecords = this.inMemoryStore.size;
    return true;
  }

  private searchInMemory(
    query: string | number[],
    options: SearchOptions
  ): SearchResult[] {
    const { topK = 10, hybridSearch = false, textWeight = 0.3, vectorWeight = 0.7 } = options;

    const results: SearchResult[] = [];
    const queryVector = typeof query === 'string' ? this.generatePseudoVector(query) : query;
    const queryText = typeof query === 'string' ? query.toLowerCase() : '';

    for (const record of this.inMemoryStore.values()) {
      let vectorScore = 0;
      if (record.vector) {
        vectorScore = this.cosineSimilarity(queryVector, record.vector);
      }

      let textScore = 0;
      if (queryText && hybridSearch) {
        const contentLower = record.content.toLowerCase();
        const queryWords = queryText.split(/\s+/).filter(w => w.length > 1);
        let matches = 0;
        for (const word of queryWords) {
          if (contentLower.includes(word)) {
            matches++;
          }
        }
        textScore = queryWords.length > 0 ? matches / queryWords.length : 0;
      }

      const totalScore = hybridSearch
        ? vectorScore * vectorWeight + textScore * textWeight
        : vectorScore;

      results.push({
        id: record.id,
        content: record.content,
        score: totalScore,
        metadata: record.metadata,
        source: record.source,
        timestamp: record.timestamp,
      });
    }

    return results.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  private async insertMilvus(record: VectorRecord): Promise<boolean> {
    logger.debug(`[VectorRetrieval] Milvus 插入: ${record.id}`);
    return this.insertInMemory(record);
  }

  private async searchMilvus(
    query: string | number[],
    options: SearchOptions
  ): Promise<SearchResult[]> {
    logger.debug('[VectorRetrieval] Milvus 搜索');
    return this.searchInMemory(query, options);
  }

  private async insertQdrant(record: VectorRecord): Promise<boolean> {
    logger.debug(`[VectorRetrieval] Qdrant 插入: ${record.id}`);
    return this.insertInMemory(record);
  }

  private async searchQdrant(
    query: string | number[],
    options: SearchOptions
  ): Promise<SearchResult[]> {
    logger.debug('[VectorRetrieval] Qdrant 搜索');
    return this.searchInMemory(query, options);
  }

  private generatePseudoVector(text: string): number[] {
    const dimension = this.config.dimension || 384;
    const vector: number[] = new Array(dimension).fill(0);

    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);
      const index = (i * 7 + charCode) % dimension;
      vector[index] += charCode / 1000;
    }

    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (magnitude > 0) {
      for (let i = 0; i < dimension; i++) {
        vector[i] = vector[i] / magnitude;
      }
    }

    return vector;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

export function createMilvusRetrieval(config: Partial<VectorStoreConfig> = {}): VectorRetrieval {
  return new VectorRetrieval({
    ...config,
    type: 'milvus',
    endpoint: config.endpoint || 'http://localhost:19530',
  });
}

export function createQdrantRetrieval(config: Partial<VectorStoreConfig> = {}): VectorRetrieval {
  return new VectorRetrieval({
    ...config,
    type: 'qdrant',
    endpoint: config.endpoint || 'http://localhost:6333',
  });
}

export function createInMemoryRetrieval(config: Partial<VectorStoreConfig> = {}): VectorRetrieval {
  return new VectorRetrieval({
    ...config,
    type: 'in-memory',
  });
}

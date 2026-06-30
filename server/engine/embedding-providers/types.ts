export interface EmbeddingResult {
  embedding: Float32Array;
  dimensions: number;
  provider: string;
  model: string;
  cached?: boolean;
  durationMs?: number;
}

export interface BatchEmbeddingResult {
  embeddings: Float32Array[];
  dimensions: number;
  provider: string;
  model: string;
  cachedCount: number;
  durationMs?: number;
}

export interface EmbeddingProviderConfig {
  providerId: string;
  displayName: string;
  model: string;
  dimensions: number;
  maxBatchSize?: number;
  maxSeqLength?: number;
  description?: string;
}

export abstract class BaseEmbeddingProvider {
  abstract readonly config: EmbeddingProviderConfig;

  abstract init(): Promise<void>;

  abstract embed(text: string): Promise<EmbeddingResult>;

  abstract embedBatch(texts: string[]): Promise<BatchEmbeddingResult>;

  abstract isReady(): boolean;

  abstract dispose(): Promise<void>;
}

export type EmbeddingProviderFactory = (options?: Record<string, unknown>) => BaseEmbeddingProvider;

export interface EmbeddingProviderRegistration {
  id: string;
  factory: EmbeddingProviderFactory;
  config: EmbeddingProviderConfig;
  isDefault?: boolean;
  priority?: number;
}

export type EmbeddingProviderStatus = 'uninitialized' | 'initializing' | 'ready' | 'failed';

export interface EmbeddingProviderStats {
  totalCalls: number;
  totalTexts: number;
  cacheHits: number;
  cacheMisses: number;
  totalDurationMs: number;
  avgDurationMs: number;
  lastCalledAt?: number;
}

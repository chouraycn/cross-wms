import { logger } from '../../logger.js';
import { BaseEmbeddingProvider, EmbeddingProviderConfig, EmbeddingResult, BatchEmbeddingResult } from './types.js';

export const ONNX_PROVIDER_CONFIG: EmbeddingProviderConfig = {
  providerId: 'onnx',
  displayName: 'ONNX Local Embedding',
  model: 'Xenova/all-MiniLM-L6-v2',
  dimensions: 384,
  maxBatchSize: 32,
  maxSeqLength: 256,
  description: '本地 ONNX 推理，all-MiniLM-L6-v2 模型，384维，无需外部API',
};

export class OnnxEmbeddingProvider extends BaseEmbeddingProvider {
  readonly config: EmbeddingProviderConfig = ONNX_PROVIDER_CONFIG;

  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initialized) return;

    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = this.doInit();
    try {
      await this.initPromise;
      this.initialized = true;
    } finally {
      this.initPromise = null;
    }
  }

  private async doInit(): Promise<void> {
    try {
      const { initOnnxEmbedding } = await import('../onnxEmbedding.js');
      await initOnnxEmbedding();
      logger.info('[OnnxEmbeddingProvider] ONNX 嵌入引擎初始化完成');
    } catch (err) {
      logger.error(
        '[OnnxEmbeddingProvider] 初始化失败:',
        err instanceof Error ? err.message : String(err)
      );
      throw err;
    }
  }

  async embed(text: string): Promise<EmbeddingResult> {
    await this.init();
    const startTime = Date.now();

    const { embedText } = await import('../onnxEmbedding.js');
    const embedding = await embedText(text);

    return {
      embedding,
      dimensions: this.config.dimensions,
      provider: this.config.providerId,
      model: this.config.model,
      cached: false,
      durationMs: Date.now() - startTime,
    };
  }

  async embedBatch(texts: string[]): Promise<BatchEmbeddingResult> {
    if (texts.length === 0) {
      return {
        embeddings: [],
        dimensions: this.config.dimensions,
        provider: this.config.providerId,
        model: this.config.model,
        cachedCount: 0,
      };
    }

    await this.init();
    const startTime = Date.now();

    const { embedBatch: onnxBatch } = await import('../onnxEmbedding.js');
    const embeddings = await onnxBatch(texts);

    return {
      embeddings,
      dimensions: this.config.dimensions,
      provider: this.config.providerId,
      model: this.config.model,
      cachedCount: 0,
      durationMs: Date.now() - startTime,
    };
  }

  isReady(): boolean {
    return this.initialized;
  }

  async dispose(): Promise<void> {
    this.initialized = false;
    this.initPromise = null;
    logger.debug('[OnnxEmbeddingProvider] 已释放');
  }
}

export function createOnnxEmbeddingProvider(_options?: Record<string, unknown>): OnnxEmbeddingProvider {
  return new OnnxEmbeddingProvider();
}

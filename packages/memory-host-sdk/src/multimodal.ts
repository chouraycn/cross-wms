import type { MemoryEntry, MemoryInsertOptions } from './types.js';

export type ModalityType = 'text' | 'image' | 'audio' | 'video' | 'pdf' | 'code' | 'structured';

export interface MultimodalContent {
  modality: ModalityType;
  data: string | Buffer;
  mimeType?: string;
  metadata?: Record<string, unknown>;
  encoding?: string;
}

export interface MultimodalMemoryEntry extends MemoryEntry {
  modality: ModalityType;
  modalityData?: MultimodalContent[];
  transcription?: string;
  description?: string;
  extractedText?: string;
  embedding?: number[];
}

export interface ModalityProcessor {
  type: ModalityType;
  canProcess(mimeType: string): boolean;
  process(content: MultimodalContent): Promise<{
    text: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }>;
}

// Embedding 提供者接口
export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
}

// 跨模态检索结果
export interface CrossModalResult {
  entry: MultimodalMemoryEntry;
  score: number;
  modality: ModalityType;
  matchedModality: ModalityType;
}

// 图像 embedding 结果
export interface ImageEmbeddingResult {
  embedding: number[];
  width: number;
  height: number;
  format: string;
}

// 音频 embedding 结果
export interface AudioEmbeddingResult {
  embedding: number[];
  duration: number;
  sampleRate: number;
  channels: number;
  transcription?: string;
}

// 视频帧提取结果
export interface VideoFrameResult {
  timestamp: number; // 毫秒
  imageData: Buffer;
  embedding?: number[];
  description?: string;
}

// 视频 embedding 结果
export interface VideoEmbeddingResult {
  embedding: number[];
  duration: number;
  frameCount: number;
  keyframes: VideoFrameResult[];
  audioEmbedding?: number[];
}

/**
 * 图像处理器
 * 支持图像 embedding 生成
 */
export class ImageProcessor implements ModalityProcessor {
  type: ModalityType = 'image';
  private embeddingProvider?: EmbeddingProvider;

  constructor(embeddingProvider?: EmbeddingProvider) {
    this.embeddingProvider = embeddingProvider;
  }

  canProcess(mimeType: string): boolean {
    return mimeType.startsWith('image/');
  }

  async process(content: MultimodalContent): Promise<{ text: string; description?: string; metadata?: Record<string, unknown> }> {
    const buffer = typeof content.data === 'string' ? Buffer.from(content.data, 'base64') : content.data;

    // 提取图像元数据
    const metadata = {
      size: buffer.length,
      mimeType: content.mimeType,
      filename: content.metadata?.filename,
      width: content.metadata?.width,
      height: content.metadata?.height,
    };

    return {
      text: `[Image: ${content.metadata?.filename || 'unnamed'}]`,
      description: `Image file (${buffer.length} bytes)`,
      metadata,
    };
  }

  /**
   * 生成图像 embedding
   * 注意：这是一个模拟实现，实际应用中需要调用视觉模型（如 CLIP、ViT 等）
   */
  async generateEmbedding(content: MultimodalContent): Promise<ImageEmbeddingResult> {
    const buffer = typeof content.data === 'string' ? Buffer.from(content.data, 'base64') : content.data;

    // 模拟 embedding 生成（实际应用中调用视觉模型）
    const embedding = this.simulateImageEmbedding(buffer);

    return {
      embedding,
      width: (content.metadata?.width as number) || 0,
      height: (content.metadata?.height as number) || 0,
      format: content.mimeType?.split('/')[1] || 'unknown',
    };
  }

  private simulateImageEmbedding(buffer: Buffer): number[] {
    // 使用缓冲区哈希作为随机种子生成伪 embedding
    const hash = this.simpleHash(buffer);
    const embedding: number[] = [];
    for (let i = 0; i < 512; i++) {
      embedding.push(Math.sin(hash + i) * 0.5);
    }
    return embedding;
  }

  private simpleHash(buffer: Buffer): number {
    let hash = 0;
    for (let i = 0; i < Math.min(buffer.length, 1000); i++) {
      hash = ((hash << 5) - hash) + buffer[i];
      hash = hash & hash;
    }
    return hash;
  }
}

/**
 * 音频处理器
 * 支持音频 embedding 和语音识别
 */
export class AudioProcessor implements ModalityProcessor {
  type: ModalityType = 'audio';
  private embeddingProvider?: EmbeddingProvider;

  constructor(embeddingProvider?: EmbeddingProvider) {
    this.embeddingProvider = embeddingProvider;
  }

  canProcess(mimeType: string): boolean {
    return mimeType.startsWith('audio/');
  }

  async process(content: MultimodalContent): Promise<{ text: string; description?: string; metadata?: Record<string, unknown> }> {
    const buffer = typeof content.data === 'string' ? Buffer.from(content.data, 'base64') : content.data;

    return {
      text: `[Audio: ${content.metadata?.filename || 'unnamed'}]`,
      description: `Audio file (${buffer.length} bytes)`,
      metadata: {
        size: buffer.length,
        mimeType: content.mimeType,
        duration: content.metadata?.duration,
        filename: content.metadata?.filename,
      },
    };
  }

  /**
   * 生成音频 embedding
   */
  async generateEmbedding(content: MultimodalContent): Promise<AudioEmbeddingResult> {
    const buffer = typeof content.data === 'string' ? Buffer.from(content.data, 'base64') : content.data;

    // 模拟 embedding 和转录（实际应用中调用音频模型）
    const embedding = this.simulateAudioEmbedding(buffer);
    const transcription = await this.simulateTranscription(content);

    return {
      embedding,
      duration: (content.metadata?.duration as number) || 0,
      sampleRate: (content.metadata?.sampleRate as number) || 44100,
      channels: (content.metadata?.channels as number) || 2,
      transcription,
    };
  }

  private simulateAudioEmbedding(buffer: Buffer): number[] {
    const hash = this.simpleHash(buffer);
    const embedding: number[] = [];
    for (let i = 0; i < 512; i++) {
      embedding.push(Math.cos(hash + i * 0.1) * 0.5);
    }
    return embedding;
  }

  private async simulateTranscription(content: MultimodalContent): Promise<string> {
    // 实际应用中调用 ASR 服务（如 Whisper）
    return content.metadata?.transcription as string || '';
  }

  private simpleHash(buffer: Buffer): number {
    let hash = 0;
    for (let i = 0; i < Math.min(buffer.length, 1000); i++) {
      hash = ((hash << 5) - hash) + buffer[i];
      hash = hash & hash;
    }
    return hash;
  }
}

/**
 * 视频处理器
 * 支持关键帧提取和视频 embedding
 */
export class VideoProcessor implements ModalityProcessor {
  type: ModalityType = 'video';
  private embeddingProvider?: EmbeddingProvider;

  constructor(embeddingProvider?: EmbeddingProvider) {
    this.embeddingProvider = embeddingProvider;
  }

  canProcess(mimeType: string): boolean {
    return mimeType.startsWith('video/');
  }

  async process(content: MultimodalContent): Promise<{ text: string; description?: string; metadata?: Record<string, unknown> }> {
    const buffer = typeof content.data === 'string' ? Buffer.from(content.data, 'base64') : content.data;

    return {
      text: `[Video: ${content.metadata?.filename || 'unnamed'}]`,
      description: `Video file (${buffer.length} bytes)`,
      metadata: {
        size: buffer.length,
        mimeType: content.mimeType,
        duration: content.metadata?.duration,
        filename: content.metadata?.filename,
      },
    };
  }

  /**
   * 提取视频关键帧
   */
  async extractKeyframes(content: MultimodalContent, intervalMs: number = 5000): Promise<VideoFrameResult[]> {
    const duration = (content.metadata?.duration as number) || 0;
    const frames: VideoFrameResult[] = [];

    // 模拟关键帧提取（实际应用中调用 FFmpeg 或类似库）
    const frameCount = Math.ceil(duration / intervalMs);

    for (let i = 0; i < frameCount; i++) {
      const timestamp = i * intervalMs;
      frames.push({
        timestamp,
        imageData: this.simulateFrameExtraction(content, i),
        embedding: this.simulateFrameEmbedding(content, i),
        description: `Frame at ${timestamp}ms`,
      });
    }

    return frames;
  }

  /**
   * 生成视频 embedding
   */
  async generateEmbedding(content: MultimodalContent): Promise<VideoEmbeddingResult> {
    const buffer = typeof content.data === 'string' ? Buffer.from(content.data, 'base64') : content.data;
    const duration = (content.metadata?.duration as number) || 0;

    // 提取关键帧
    const keyframes = await this.extractKeyframes(content);

    // 合并帧 embedding（取平均）
    const embedding = this.aggregateFrameEmbeddings(keyframes);

    return {
      embedding,
      duration,
      frameCount: keyframes.length,
      keyframes,
    };
  }

  private simulateFrameExtraction(content: MultimodalContent, frameIndex: number): Buffer {
    // 模拟帧提取
    const size = 1024 + (frameIndex * 100);
    return Buffer.alloc(size, frameIndex % 256);
  }

  private simulateFrameEmbedding(content: MultimodalContent, frameIndex: number): number[] {
    const embedding: number[] = [];
    for (let i = 0; i < 512; i++) {
      embedding.push(Math.sin(frameIndex + i * 0.01) * 0.5);
    }
    return embedding;
  }

  private aggregateFrameEmbeddings(frames: VideoFrameResult[]): number[] {
    if (frames.length === 0) {
      return new Array(512).fill(0);
    }

    const aggregated = new Array(512).fill(0);
    for (const frame of frames) {
      if (frame.embedding) {
        for (let i = 0; i < 512; i++) {
          aggregated[i] += frame.embedding[i];
        }
      }
    }

    for (let i = 0; i < 512; i++) {
      aggregated[i] /= frames.length;
    }

    return aggregated;
  }
}

/**
 * PDF 处理器
 */
export class PdfProcessor implements ModalityProcessor {
  type: ModalityType = 'pdf';

  canProcess(mimeType: string): boolean {
    return mimeType === 'application/pdf';
  }

  async process(content: MultimodalContent): Promise<{ text: string; description?: string; metadata?: Record<string, unknown> }> {
    const buffer = typeof content.data === 'string' ? Buffer.from(content.data, 'base64') : content.data;
    return {
      text: `[PDF: ${content.metadata?.filename || 'unnamed'}]`,
      description: `PDF document (${buffer.length} bytes)`,
      metadata: {
        size: buffer.length,
        mimeType: content.mimeType,
        pages: content.metadata?.pages,
        filename: content.metadata?.filename,
      },
    };
  }
}

/**
 * 代码处理器
 */
export class CodeProcessor implements ModalityProcessor {
  type: ModalityType = 'code';

  canProcess(mimeType: string): boolean {
    return mimeType.startsWith('text/x-') || ['application/javascript', 'application/typescript'].includes(mimeType);
  }

  async process(content: MultimodalContent): Promise<{ text: string; description?: string; metadata?: Record<string, unknown> }> {
    const code = typeof content.data === 'string' ? content.data : content.data.toString('utf-8');
    const lines = code.split('\n').length;
    return {
      text: code,
      description: `Code (${lines} lines)`,
      metadata: {
        lines,
        language: content.metadata?.language,
        mimeType: content.mimeType,
      },
    };
  }
}

/**
 * 文本处理器
 */
export class TextProcessor implements ModalityProcessor {
  type: ModalityType = 'text';

  canProcess(mimeType: string): boolean {
    return mimeType.startsWith('text/') || mimeType === 'application/json';
  }

  async process(content: MultimodalContent): Promise<{ text: string; description?: string; metadata?: Record<string, unknown> }> {
    const text = typeof content.data === 'string' ? content.data : content.data.toString('utf-8');
    return {
      text,
      description: `Text content (${text.length} characters)`,
      metadata: { length: text.length, mimeType: content.mimeType },
    };
  }
}

/**
 * 多模态处理器
 * 支持图像/音频/视频 embedding 和跨模态检索
 */
export class MultimodalProcessor {
  private processors: Map<ModalityType, ModalityProcessor>;
  private embeddingProvider?: EmbeddingProvider;

  constructor(embeddingProvider?: EmbeddingProvider) {
    this.embeddingProvider = embeddingProvider;
    this.processors = new Map();
    this.processors.set('text', new TextProcessor());
    this.processors.set('image', new ImageProcessor(embeddingProvider));
    this.processors.set('audio', new AudioProcessor(embeddingProvider));
    this.processors.set('video', new VideoProcessor(embeddingProvider));
    this.processors.set('pdf', new PdfProcessor());
    this.processors.set('code', new CodeProcessor());
  }

  detectModality(mimeType: string): ModalityType | null {
    for (const [type, processor] of this.processors) {
      if (processor.canProcess(mimeType)) {
        return type;
      }
    }
    return null;
  }

  async processContent(content: MultimodalContent): Promise<{
    text: string;
    description?: string;
    modality: ModalityType;
    metadata?: Record<string, unknown>;
  }> {
    const processor = this.processors.get(content.modality);
    if (!processor) {
      throw new Error(`No processor for modality: ${content.modality}`);
    }

    const result = await processor.process(content);
    return {
      ...result,
      modality: content.modality,
    };
  }

  async processMultiple(contents: MultimodalContent[]): Promise<Array<{
    text: string;
    description?: string;
    modality: ModalityType;
    metadata?: Record<string, unknown>;
  }>> {
    return Promise.all(contents.map((c) => this.processContent(c)));
  }

  registerProcessor(processor: ModalityProcessor): void {
    this.processors.set(processor.type, processor);
  }

  getSupportedModalities(): ModalityType[] {
    return Array.from(this.processors.keys());
  }

  /**
   * 生成多模态 embedding
   */
  async generateEmbedding(content: MultimodalContent): Promise<number[]> {
    const processor = this.processors.get(content.modality);

    if (!processor) {
      throw new Error(`No processor for modality: ${content.modality}`);
    }

    // 根据模态类型生成 embedding
    if (processor instanceof ImageProcessor) {
      const result = await processor.generateEmbedding(content);
      return result.embedding;
    } else if (processor instanceof AudioProcessor) {
      const result = await processor.generateEmbedding(content);
      return result.embedding;
    } else if (processor instanceof VideoProcessor) {
      const result = await processor.generateEmbedding(content);
      return result.embedding;
    }

    // 默认：使用文本 embedding
    if (this.embeddingProvider) {
      const processed = await processor.process(content);
      return this.embeddingProvider.embed(processed.text);
    }

    // 模拟 embedding
    return this.simulateTextEmbedding(content);
  }

  private simulateTextEmbedding(content: MultimodalContent): number[] {
    const text = typeof content.data === 'string' ? content.data : content.data.toString('utf-8');
    const hash = this.simpleHash(text);
    const embedding: number[] = [];
    for (let i = 0; i < 512; i++) {
      embedding.push(Math.sin(hash + i * 0.05) * 0.5);
    }
    return embedding;
  }

  private simpleHash(text: string): number {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash = hash & hash;
    }
    return hash;
  }

  /**
   * 跨模态检索
   */
  async crossModalSearch(
    query: { modality: ModalityType; data: string | Buffer } | { text: string },
    entries: MultimodalMemoryEntry[],
    options?: {
      topK?: number;
      threshold?: number;
      targetModalities?: ModalityType[];
    },
  ): Promise<CrossModalResult[]> {
    const topK = options?.topK ?? 10;
    const threshold = options?.threshold ?? 0.5;
    const targetModalities = options?.targetModalities;

    // 生成查询 embedding
    let queryEmbedding: number[];

    if ('text' in query) {
      // 文本查询
      if (this.embeddingProvider) {
        queryEmbedding = await this.embeddingProvider.embed(query.text);
      } else {
        queryEmbedding = this.simulateTextEmbedding({ modality: 'text', data: query.text } as MultimodalContent);
      }
    } else {
      // 多模态查询
      queryEmbedding = await this.generateEmbedding({
        modality: query.modality,
        data: query.data,
      } as MultimodalContent);
    }

    // 计算相似度
    const results: CrossModalResult[] = [];

    for (const entry of entries) {
      if (!entry.embedding) continue;

      // 过滤目标模态
      if (targetModalities && !targetModalities.includes(entry.modality)) {
        continue;
      }

      const score = this.cosineSimilarity(queryEmbedding, entry.embedding);

      if (score >= threshold) {
        results.push({
          entry,
          score,
          modality: 'text' in query ? 'text' : query.modality,
          matchedModality: entry.modality,
        });
      }
    }

    // 排序并返回 topK
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
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

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }
}

export const multimodalProcessor = new MultimodalProcessor();

export async function createMultimodalEntry(
  contents: MultimodalContent[],
  options: MemoryInsertOptions = {},
): Promise<Partial<MultimodalMemoryEntry>> {
  const processed = await multimodalProcessor.processMultiple(contents);
  const texts = processed.map((p) => p.text).join('\n\n');
  const descriptions = processed.map((p) => p.description).filter(Boolean).join('; ');
  const primaryModality = contents[0]?.modality || 'text';

  // 生成 embedding
  let embedding: number[] | undefined;
  if (contents.length === 1) {
    embedding = await multimodalProcessor.generateEmbedding(contents[0]);
  }

  return {
    text: texts,
    description: descriptions,
    modality: primaryModality,
    modalityData: contents,
    embedding,
    metadata: {
      ...options.metadata,
      modalities: processed.map((p) => p.modality),
      modalityCount: processed.length,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
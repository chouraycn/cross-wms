/**
 * Media Analyzer Registry — 媒体分析器注册表
 *
 * 将 MediaKind 映射到对应的 MediaAnalyzer，统一调度分析请求。
 * 自动根据输入的 MIME / 文件名选择合适的分析器。
 */

import { logger } from '../../logger.js';
import { createAudioAnalyzer } from './audio-analyzer.js';
import { createDocumentAnalyzer } from './document-analyzer.js';
import { createImageAnalyzer } from './image-analyzer.js';
import type { ProviderRegistry } from './provider-registry.js';
import { createProviderRegistry } from './provider-registry.js';
import { createVideoAnalyzer } from './video-analyzer.js';
import type {
  AnalyzeOptions,
  MediaAnalysis,
  MediaAnalyzer,
  MediaInput,
  MediaKind,
} from './types.js';
import { inferMediaKind } from './types.js';

export interface MediaAnalyzerRegistryOptions {
  providerRegistry?: ProviderRegistry;
  imageAnalyzer?: MediaAnalyzer;
  videoAnalyzer?: MediaAnalyzer;
  audioAnalyzer?: MediaAnalyzer;
  documentAnalyzer?: MediaAnalyzer;
}

export class MediaAnalyzerRegistry {
  private readonly analyzers = new Map<MediaKind, MediaAnalyzer>();
  readonly providers: ProviderRegistry;

  constructor(opts: MediaAnalyzerRegistryOptions = {}) {
    this.providers = opts.providerRegistry ?? createProviderRegistry();

    const image = opts.imageAnalyzer ?? createImageAnalyzer({ registry: this.providers });
    const video = opts.videoAnalyzer ?? createVideoAnalyzer({ registry: this.providers });
    const audio = opts.audioAnalyzer ?? createAudioAnalyzer({ registry: this.providers });
    const document = opts.documentAnalyzer ?? createDocumentAnalyzer({ registry: this.providers });

    this.register(image);
    this.register(video);
    this.register(audio);
    this.register(document);
  }

  /** 注册或覆盖分析器 */
  register(analyzer: MediaAnalyzer): void {
    this.analyzers.set(analyzer.id, analyzer);
    logger.debug(`[MediaRegistry] registered analyzer: ${analyzer.id}`);
  }

  /** 注销分析器 */
  unregister(kind: MediaKind): boolean {
    const removed = this.analyzers.delete(kind);
    if (removed) logger.debug(`[MediaRegistry] unregistered analyzer: ${kind}`);
    return removed;
  }

  /** 获取指定类型的分析器 */
  get(kind: MediaKind): MediaAnalyzer | undefined {
    return this.analyzers.get(kind);
  }

  /** 列出已注册的分析器类型 */
  list(): MediaKind[] {
    return Array.from(this.analyzers.keys());
  }

  /** 根据 MIME / 文件名选择分析器 */
  resolveAnalyzer(input: MediaInput): MediaAnalyzer | undefined {
    const kind = inferMediaKind(input.mime, input.fileName);
    if (!kind) return undefined;
    return this.analyzers.get(kind);
  }

  /**
   * 自动选择分析器并执行分析。
   * 若输入缺少 MIME/文件名，可显式传入 kind 覆盖。
   */
  async analyze(
    input: MediaInput,
    options?: AnalyzeOptions & { kind?: MediaKind },
  ): Promise<MediaAnalysis> {
    const kind = options?.kind ?? inferMediaKind(input.mime, input.fileName);
    if (!kind) {
      throw new Error('无法推断媒体类型，请提供 mime/fileName 或显式指定 kind');
    }
    const analyzer = this.analyzers.get(kind);
    if (!analyzer) {
      throw new Error(`未注册 ${kind} 类型的分析器`);
    }
    return analyzer.analyze(input, options);
  }
}

/** 创建默认注册表（不含任何 Provider，需调用方注入） */
export function createMediaAnalyzerRegistry(
  opts?: MediaAnalyzerRegistryOptions,
): MediaAnalyzerRegistry {
  return new MediaAnalyzerRegistry(opts ?? {});
}

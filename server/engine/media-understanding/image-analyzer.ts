/**
 * Image Analyzer — 图像分析器
 *
 * 提供图像描述、标签、OCR、人脸检测、安全检测能力。
 * 通过注入的 Provider Registry 与 Cache 协作。
 */

import { logger } from '../../logger.js';
import { buildCacheKey, MediaAnalysisCache } from './cache.js';
import { findOcrProvider, findProviderForCapability, type ProviderRegistry } from './provider-registry.js';
import type {
  AnalyzeOptions,
  ImageDescription,
  ImageSafetyResult,
  MediaAnalysis,
  MediaAnalyzer,
  MediaInput,
} from './types.js';

export interface ImageAnalyzerOptions {
  registry: ProviderRegistry;
  cache?: MediaAnalysisCache<ImageDescription>;
  /** 默认 OCR Provider id */
  defaultOcrProviderId?: string;
  /** 默认多模态 Provider id */
  defaultMultimodalProviderId?: string;
}

const SUPPORTED_MIMES = ['image/'];

export function createImageAnalyzer(opts: ImageAnalyzerOptions): MediaAnalyzer {
  const cache = opts.cache ?? new MediaAnalysisCache<ImageDescription>();

  async function analyze(
    input: MediaInput,
    options?: AnalyzeOptions,
  ): Promise<MediaAnalysis> {
    const provider = findProviderForCapability(
      opts.registry,
      'image',
      options?.providerId ?? opts.defaultMultimodalProviderId,
    );
    if (!provider || !provider.describeImage) {
      throw new Error('未找到支持图像分析的多模态 Provider');
    }

    const useCache = options?.skipCache !== true;
    const cacheKey = buildCacheKey(input);
    if (useCache) {
      const cached = cache.get(cacheKey);
      if (cached) {
        logger.debug(`[ImageAnalyzer] cache hit: ${input.fileName ?? input.url ?? 'buffer'}`);
        return { kind: 'image', result: cached };
      }
    }

    const result = await provider.describeImage(input, options);

    if (options?.ocr && !result.ocrText) {
      const ocrProvider = findOcrProvider(opts.registry, opts.defaultOcrProviderId);
      if (ocrProvider && input.buffer) {
        try {
          result.ocrText = await ocrProvider.recognize(input.buffer, input.mime);
        } catch (e) {
          logger.warn(`[ImageAnalyzer] OCR failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    if (options?.safetyDetection !== false && !result.safety) {
      result.safety = applyHeuristicSafety(input, result);
    }

    if (useCache) {
      cache.set(cacheKey, result);
    }
    return { kind: 'image', result };
  }

  return {
    id: 'image',
    supportedMimes: SUPPORTED_MIMES,
    analyze,
  };
}

/**
 * 启发式安全检测：基于文件大小、MIME、描述关键词做基础判断。
 * 真正的安全检测应由 Provider 完成，此函数仅作为兜底。
 */
function applyHeuristicSafety(input: MediaInput, description: ImageDescription): ImageSafetyResult {
  const descriptionLower = description.description.toLowerCase();
  const unsafeKeywords = ['nsfw', 'nude', 'violence', 'gore', 'weapon'];
  for (const keyword of unsafeKeywords) {
    if (descriptionLower.includes(keyword)) {
      return {
        safe: false,
        categories: [keyword],
        confidence: 0.6,
      };
    }
  }
  const tooLarge = input.buffer && input.buffer.length > 50 * 1024 * 1024;
  if (tooLarge) {
    return {
      safe: false,
      categories: ['oversized'],
      confidence: 0.5,
    };
  }
  return {
    safe: true,
    categories: [],
    confidence: 0.5,
  };
}

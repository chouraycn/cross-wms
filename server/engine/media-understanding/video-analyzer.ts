/**
 * Video Analyzer — 视频分析器
 *
 * 提供关键帧提取、场景分析、动作识别能力。
 */

import { logger } from '../../logger.js';
import { buildCacheKey, MediaAnalysisCache } from './cache.js';
import { findProviderForCapability, type ProviderRegistry } from './provider-registry.js';
import type {
  AnalyzeOptions,
  MediaAnalysis,
  MediaAnalyzer,
  MediaInput,
  VideoAnalysis,
} from './types.js';

export interface VideoAnalyzerOptions {
  registry: ProviderRegistry;
  cache?: MediaAnalysisCache<VideoAnalysis>;
  defaultMultimodalProviderId?: string;
  /** 关键帧采样间隔（秒），默认 10 */
  keyframeIntervalSeconds?: number;
}

const SUPPORTED_MIMES = ['video/'];

export function createVideoAnalyzer(opts: VideoAnalyzerOptions): MediaAnalyzer {
  const cache = opts.cache ?? new MediaAnalysisCache<VideoAnalysis>();
  const keyframeInterval = opts.keyframeIntervalSeconds ?? 10;

  async function analyze(
    input: MediaInput,
    options?: AnalyzeOptions,
  ): Promise<MediaAnalysis> {
    const provider = findProviderForCapability(
      opts.registry,
      'video',
      options?.providerId ?? opts.defaultMultimodalProviderId,
    );
    if (!provider || !provider.describeVideo) {
      throw new Error('未找到支持视频分析的多模态 Provider');
    }

    const useCache = options?.skipCache !== true;
    const cacheKey = buildCacheKey(input);
    if (useCache) {
      const cached = cache.get(cacheKey);
      if (cached) {
        logger.debug(`[VideoAnalyzer] cache hit: ${input.fileName ?? input.url ?? 'buffer'}`);
        return { kind: 'video', result: cached };
      }
    }

    const result = await provider.describeVideo(input, options);
    if (result.keyframes.length === 0 && result.durationSeconds) {
      result.keyframes = sampleKeyframes(result.durationSeconds, keyframeInterval, result.description);
    }
    if (result.scenes.length === 0 && result.durationSeconds) {
      result.scenes = buildDefaultScenes(result.durationSeconds, result.description);
    }

    if (useCache) {
      cache.set(cacheKey, result);
    }
    return { kind: 'video', result };
  }

  return {
    id: 'video',
    supportedMimes: SUPPORTED_MIMES,
    analyze,
  };
}

/** 根据时长和间隔均匀采样关键帧 */
export function sampleKeyframes(
  durationSeconds: number,
  intervalSeconds: number,
  description: string,
): { timestamp: number; description: string }[] {
  const frames: { timestamp: number; description: string }[] = [];
  for (let t = 0; t < durationSeconds; t += intervalSeconds) {
    frames.push({ timestamp: Math.round(t * 10) / 10, description });
  }
  return frames;
}

/** 默认场景切分：将视频按 30 秒分段 */
export function buildDefaultScenes(
  durationSeconds: number,
  description: string,
): { start: number; end: number; description: string }[] {
  const scenes: { start: number; end: number; description: string }[] = [];
  const sceneLength = 30;
  for (let t = 0; t < durationSeconds; t += sceneLength) {
    scenes.push({
      start: t,
      end: Math.min(t + sceneLength, durationSeconds),
      description,
    });
  }
  return scenes;
}

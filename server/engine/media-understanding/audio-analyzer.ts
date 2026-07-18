/**
 * Audio Analyzer — 音频分析器
 *
 * 提供语音识别、音乐检测、情绪分析能力。
 */

import { logger } from '../../logger.js';
import { buildCacheKey, MediaAnalysisCache } from './cache.js';
import { findProviderForCapability, type ProviderRegistry } from './provider-registry.js';
import type {
  AnalyzeOptions,
  AudioAnalysis,
  MediaAnalysis,
  MediaAnalyzer,
  MediaInput,
} from './types.js';

export interface AudioAnalyzerOptions {
  registry: ProviderRegistry;
  cache?: MediaAnalysisCache<AudioAnalysis>;
  defaultMultimodalProviderId?: string;
}

const SUPPORTED_MIMES = ['audio/'];

/** 基于转写文本的简单情绪启发式分析 */
export function inferEmotionFromText(text: string): AudioAnalysis['emotion'] {
  const lower = text.toLowerCase();
  const markers: Record<string, string[]> = {
    happy: ['happy', 'glad', 'joy', '笑', '开心', '高兴', '快乐'],
    sad: ['sad', 'cry', 'tears', '哭', '难过', '悲伤', '伤心'],
    angry: ['angry', 'mad', 'furious', '生气', '愤怒', '气愤'],
    calm: ['calm', 'peaceful', 'quiet', '平静', '安静', '温和'],
    excited: ['excited', 'wow', 'amazing', '激动', '兴奋', '太棒了'],
  };

  const distribution: Record<string, number> = {};
  for (const [emotion, keywords] of Object.entries(markers)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        distribution[emotion] = (distribution[emotion] ?? 0) + 1;
      }
    }
  }

  const entries = Object.entries(distribution);
  if (entries.length === 0) {
    return { primary: 'neutral', distribution: { neutral: 1 } };
  }
  entries.sort((a, b) => b[1] - a[1]);
  const [primary, count] = entries[0];
  const total = entries.reduce((sum, [, c]) => sum + c, 0);
  const normalized: Record<string, number> = {};
  for (const [emotion, c] of entries) {
    normalized[emotion] = Math.round((c / total) * 100) / 100;
  }
  return { primary, distribution: normalized };
}

export function createAudioAnalyzer(opts: AudioAnalyzerOptions): MediaAnalyzer {
  const cache = opts.cache ?? new MediaAnalysisCache<AudioAnalysis>();

  async function analyze(
    input: MediaInput,
    options?: AnalyzeOptions,
  ): Promise<MediaAnalysis> {
    const provider = findProviderForCapability(
      opts.registry,
      'audio',
      options?.providerId ?? opts.defaultMultimodalProviderId,
    );
    if (!provider || !provider.transcribeAudio) {
      throw new Error('未找到支持音频分析的多模态 Provider');
    }

    const useCache = options?.skipCache !== true;
    const cacheKey = buildCacheKey(input);
    if (useCache) {
      const cached = cache.get(cacheKey);
      if (cached) {
        logger.debug(`[AudioAnalyzer] cache hit: ${input.fileName ?? input.url ?? 'buffer'}`);
        return { kind: 'audio', result: cached };
      }
    }

    const result = await provider.transcribeAudio(input, options);
    if (!result.emotion && result.transcript) {
      result.emotion = inferEmotionFromText(result.transcript);
    }

    if (useCache) {
      cache.set(cacheKey, result);
    }
    return { kind: 'audio', result };
  }

  return {
    id: 'audio',
    supportedMimes: SUPPORTED_MIMES,
    analyze,
  };
}

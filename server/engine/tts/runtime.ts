/**
 * TTS 运行时 — 文本预处理、Provider 解析、音频合成与缓存的编排层。
 *
 * 参考 openclaw/src/tts/tts-core.ts 的协调职责，串联：
 * text-processor → ssml-parser → provider-resolver → provider.synthesize
 * → audio-encoder（按需）→ cache-manager。
 */

import { logger } from '../../logger.js';
import type { TTSConfig, TTSRequest, TTSResult, TTSStreamChunk } from './types.js';
import { DEFAULT_TTS_CONFIG } from './types.js';
import { providerRegistry, type ProviderRegistry } from './provider-registry.js';
import { resolveSynthesisParams } from './provider-resolver.js';
import { preprocessText } from './text-processor.js';
import { isSsml, parseSsml } from './ssml-parser.js';
import { TTSCacheManager, buildCacheKey } from './cache-manager.js';
import { encodeAudio } from './audio-encoder.js';
import { streamSynthesize } from './stream-manager.js';
import { registerBuiltinProviders } from './providers/index.js';

/** 将用户配置与默认配置合并，保证标量字段有值。 */
export function resolveTTSConfig(input?: TTSConfig): TTSConfig {
  return {
    provider: input?.provider ?? DEFAULT_TTS_CONFIG.provider,
    defaultLanguage: input?.defaultLanguage ?? DEFAULT_TTS_CONFIG.defaultLanguage,
    defaultFormat: input?.defaultFormat ?? DEFAULT_TTS_CONFIG.defaultFormat,
    defaultSampleRate: input?.defaultSampleRate ?? DEFAULT_TTS_CONFIG.defaultSampleRate,
    timeoutMs: input?.timeoutMs ?? DEFAULT_TTS_CONFIG.timeoutMs,
    maxLength: input?.maxLength ?? DEFAULT_TTS_CONFIG.maxLength,
    enableCache: input?.enableCache ?? DEFAULT_TTS_CONFIG.enableCache,
    cacheMaxEntries: input?.cacheMaxEntries ?? DEFAULT_TTS_CONFIG.cacheMaxEntries,
    cacheMaxBytes: input?.cacheMaxBytes ?? DEFAULT_TTS_CONFIG.cacheMaxBytes,
    cacheTtlMs: input?.cacheTtlMs ?? DEFAULT_TTS_CONFIG.cacheTtlMs,
    enableSsml: input?.enableSsml ?? DEFAULT_TTS_CONFIG.enableSsml,
    streaming: input?.streaming ?? DEFAULT_TTS_CONFIG.streaming,
    defaultVoice: input?.defaultVoice,
    providers: input?.providers,
  };
}

/** 文本预处理结果。 */
export interface PreparedText {
  text: string;
  /** 从 SSML 中提取的声音覆盖（若有）。 */
  voice?: string;
}

/** TTS 运行时构造选项。 */
export interface TTSRuntimeOptions {
  config?: TTSConfig;
  registry?: ProviderRegistry;
  cache?: TTSCacheManager;
}

/** TTS 运行时，编排合成全流程。 */
export class TTSRuntime {
  readonly config: TTSConfig;
  private readonly registry: ProviderRegistry;
  private readonly cache: TTSCacheManager;

  constructor(options: TTSRuntimeOptions = {}) {
    this.config = resolveTTSConfig(options.config);
    this.registry = options.registry ?? providerRegistry;
    // 幂等注册内置 Provider
    registerBuiltinProviders(this.registry);
    this.cache =
      options.cache ??
      new TTSCacheManager({
        maxEntries: this.config.cacheMaxEntries,
        maxBytes: this.config.cacheMaxBytes,
        ttlMs: this.config.cacheTtlMs,
      });
  }

  /** 获取底层注册表（便于列举 Provider/声音）。 */
  getRegistry(): ProviderRegistry {
    return this.registry;
  }

  /**
   * 文本预处理：SSML 则解析提取纯文本与声音；否则走 Markdown/数字/标点清洗。
   */
  prepareText(text: string, options: { ssml?: boolean; language?: string } = {}): PreparedText {
    const useSsml = (options.ssml || isSsml(text)) && this.config.enableSsml;
    if (useSsml) {
      const parsed = parseSsml(text);
      return { text: parsed.text, voice: parsed.voice };
    }
    return { text: preprocessText(text, { language: options.language }) };
  }

  /** 一次性合成音频。 */
  async synthesize(request: TTSRequest): Promise<TTSResult> {
    const language = request.language ?? this.config.defaultLanguage;
    const prepared = this.prepareText(request.text, { ssml: request.ssml, language });
    const text = prepared.text;
    if (!text.trim()) throw new Error('TTS 文本不能为空');

    const effectiveRequest: TTSRequest = {
      ...request,
      voice: request.voice ?? prepared.voice,
    };
    const { provider, providerConfig, voice, format, sampleRate } = resolveSynthesisParams(
      this.config,
      effectiveRequest,
      this.registry,
    );

    const useCache = request.useCache ?? this.config.enableCache;
    const cacheKey = buildCacheKey(text, provider.id, voice, format);
    if (useCache) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        logger.debug('[TTS] 缓存命中', { provider: provider.id, voice, format });
        return { ...cached, cached: true };
      }
    }

    logger.debug('[TTS] 开始合成', {
      provider: provider.id,
      voice,
      format,
      length: text.length,
    });

    const result = await provider.synthesize({
      text,
      config: providerConfig,
      voice,
      format,
      sampleRate,
      speed: request.speed,
      pitch: request.pitch,
      volume: request.volume,
      ssml: request.ssml,
      timeoutMs: this.config.timeoutMs,
      fetchFn: request.fetchFn,
    });

    // 格式兜底：Provider 返回格式与目标不一致且可转码时转换
    let audio = result.audio;
    if (result.format !== format) {
      audio = encodeAudio(result.audio, result.format, format, { sampleRate });
    }

    const ttsResult: TTSResult = {
      audio,
      format,
      provider: provider.id,
      voice,
      sampleRate: result.sampleRate ?? sampleRate,
      metadata: result.metadata,
    };

    if (useCache) this.cache.set(ttsResult, cacheKey);
    return ttsResult;
  }

  /** 流式合成，逐段产出分块。 */
  async *stream(request: TTSRequest): AsyncGenerator<TTSStreamChunk, void, void> {
    const language = request.language ?? this.config.defaultLanguage;
    const prepared = this.prepareText(request.text, { ssml: request.ssml, language });
    const text = prepared.text;
    if (!text.trim()) throw new Error('TTS 文本不能为空');

    const effectiveRequest: TTSRequest = {
      ...request,
      voice: request.voice ?? prepared.voice,
    };
    const { provider, providerConfig, voice, format, sampleRate } = resolveSynthesisParams(
      this.config,
      effectiveRequest,
      this.registry,
    );

    yield* streamSynthesize({
      text,
      provider,
      providerConfig,
      voice,
      format,
      sampleRate,
      speed: request.speed,
      pitch: request.pitch,
      volume: request.volume,
      maxLength: request.maxLength ?? this.config.maxLength,
      timeoutMs: this.config.timeoutMs,
      fetchFn: request.fetchFn,
    });
  }

  /** 返回缓存统计。 */
  getCacheStats() {
    return this.cache.getStats();
  }

  /** 清空缓存。 */
  clearCache(): void {
    this.cache.clear();
  }
}

/** 创建 TTS 运行时实例。 */
export function createTTSRuntime(options: TTSRuntimeOptions = {}): TTSRuntime {
  return new TTSRuntime(options);
}

let defaultRuntime: TTSRuntime | undefined;

/** 获取进程级默认运行时（懒初始化）。 */
export function getDefaultTTSRuntime(): TTSRuntime {
  if (!defaultRuntime) defaultRuntime = new TTSRuntime();
  return defaultRuntime;
}

/** 使用默认运行时合成音频的便捷方法。 */
export function synthesize(request: TTSRequest): Promise<TTSResult> {
  return getDefaultTTSRuntime().synthesize(request);
}

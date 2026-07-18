/**
 * TTS 模块统一导出 — 文本转语音系统入口。
 *
 * 国内 Provider（阿里云、腾讯云、讯飞）优先支持，并兼容 OpenAI、Edge。
 * 使用示例：
 *   import { synthesize } from './engine/tts/index.js';
 *   const result = await synthesize({ text: '你好，世界' });
 */

// 类型与常量
export type {
  AudioFormat,
  TTSProviderId,
  TTSProviderSelector,
  Gender,
  Voice,
  ProviderConfig,
  TTSConfig,
  TTSRequest,
  TTSResult,
  TTSStreamChunk,
  SynthesizeRequest,
  SynthesizeResult,
  ListVoicesRequest,
  DirectivePolicy,
  TTSProviderPlugin,
  ParsedSsml,
  SsmlMark,
  CacheStats,
} from './types.js';
export {
  AUDIO_FORMATS,
  PROVIDER_IDS,
  DEFAULT_TTS_CONFIG,
  DEFAULT_DIRECTIVE_POLICY,
} from './types.js';

// Provider 注册表
export {
  normalizeProviderId,
  createProviderRegistry,
  providerRegistry,
} from './provider-registry.js';
export type { ProviderRegistry } from './provider-registry.js';

// Provider 解析器
export {
  getProviderConfig,
  sortByAutoSelectOrder,
  listConfiguredProviders,
  selectProviderForLanguage,
  resolveProvider,
  resolveVoice,
  resolveFormat,
  resolveSampleRate,
  resolveSynthesisParams,
} from './provider-resolver.js';
export type { ResolvedSynthesis } from './provider-resolver.js';

// 文本处理器
export {
  segmentText,
  normalizeNumbers,
  normalizePunctuation,
  stripMarkdown,
  detectLanguage,
  padMixedCnEn,
  preprocessText,
} from './text-processor.js';
export type { PreprocessTextOptions } from './text-processor.js';

// SSML 解析器
export {
  isSsml,
  stripSsml,
  parseSsml,
  buildSsml,
  escapeSsmlText,
  ensurePlainText,
} from './ssml-parser.js';
export type { BuildSsmlOptions } from './ssml-parser.js';

// 音频编码器
export {
  buildWavHeader,
  pcmToWav,
  wavToPcm,
  concatPcm,
  detectFormat,
  encodeAudio,
  resamplePcm,
  estimateDurationMs,
} from './audio-encoder.js';
export type { WavInfo, EncodeOptions } from './audio-encoder.js';

// 缓存管理
export { TTSCacheManager, buildCacheKey } from './cache-manager.js';
export type { TTSCacheOptions } from './cache-manager.js';

// 流式管理
export { streamSynthesize, collectStream } from './stream-manager.js';
export type { StreamSynthesizeParams } from './stream-manager.js';

// 声音管理
export { VoiceManager, listVoices, findVoice, selectVoice } from './voice-manager.js';

// 运行时
export {
  TTSRuntime,
  createTTSRuntime,
  getDefaultTTSRuntime,
  synthesize,
  resolveTTSConfig,
} from './runtime.js';
export type { TTSRuntimeOptions, PreparedText } from './runtime.js';

// Provider 实现
export {
  createAliyunProvider,
  buildAliyunRequest,
  createTencentProvider,
  buildTencentSignature,
  buildTencentRequest,
  timestampToDate,
  createXfyunProvider,
  buildXfyunAuth,
  buildXfyunRequest,
  createOpenAiProvider,
  buildOpenAiRequest,
  createEdgeProvider,
  buildEdgeRequest,
  registerBuiltinProviders,
  BUILTIN_PROVIDER_FACTORIES,
  httpRequest,
  postJsonBinary,
  resolveApiKey,
  pickFormat,
} from './providers/index.js';
export type {
  TencentSignParams,
  TencentSignature,
  XfyunAuthParams,
  XfyunAuth,
  HttpRequestOptions,
  HttpResponse,
} from './providers/index.js';

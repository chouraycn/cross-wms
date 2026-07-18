/**
 * TTS 类型定义 — 文本转语音系统的共享类型。
 *
 * 参考 openclaw/src/tts/tts-types.ts 与 provider-types.ts，针对国内语音服务
 * （阿里云、腾讯云、讯飞）适配，移除插件/能力运行时耦合，保持模块自洽。
 */

/** 支持的音频输出格式。 */
export type AudioFormat = 'mp3' | 'opus' | 'wav' | 'pcm' | 'aac';

/** 内置 Provider 标识。 */
export type TTSProviderId = 'aliyun' | 'tencent' | 'xfyun' | 'openai' | 'edge';

/** Provider 选择占位符，由解析器自动挑选。 */
export type TTSProviderSelector = TTSProviderId | 'auto';

/** 声音性别。 */
export type Gender = 'male' | 'female' | 'neutral';

/** 支持的音频格式清单。 */
export const AUDIO_FORMATS: readonly AudioFormat[] = ['mp3', 'opus', 'wav', 'pcm', 'aac'];

/** 内置 Provider 标识清单（国内优先）。 */
export const PROVIDER_IDS: readonly TTSProviderId[] = [
  'aliyun',
  'tencent',
  'xfyun',
  'openai',
  'edge',
];

/** 声音元数据。 */
export interface Voice {
  id: string;
  name?: string;
  provider?: string;
  language?: string;
  locale?: string;
  gender?: Gender;
  description?: string;
  sampleRate?: number;
}

/** 单个 Provider 的连接与渲染配置。 */
export interface ProviderConfig {
  apiKey?: string;
  /** 腾讯云/讯飞签名所需的 SecretKey。 */
  secretKey?: string;
  /** 讯飞 AppId。 */
  appId?: string;
  baseUrl?: string;
  region?: string;
  model?: string;
  voice?: string;
  format?: AudioFormat;
  sampleRate?: number;
  enabled?: boolean;
  [key: string]: unknown;
}

/** TTS 运行时顶层配置。 */
export interface TTSConfig {
  provider?: TTSProviderSelector;
  defaultVoice?: string;
  defaultLanguage?: string;
  defaultFormat?: AudioFormat;
  defaultSampleRate?: number;
  timeoutMs?: number;
  /** 单次合成文本最大长度，超出则分段。 */
  maxLength?: number;
  enableCache?: boolean;
  cacheMaxEntries?: number;
  cacheMaxBytes?: number;
  cacheTtlMs?: number;
  enableSsml?: boolean;
  streaming?: boolean;
  providers?: Record<string, ProviderConfig>;
}

/** 文本转语音请求。 */
export interface TTSRequest {
  text: string;
  provider?: TTSProviderSelector;
  voice?: string;
  language?: string;
  format?: AudioFormat;
  /** 0.5 ~ 2.0，1.0 为正常语速。 */
  speed?: number;
  /** -6 ~ 6，0 为正常音调。 */
  pitch?: number;
  /** 0 ~ 100，50 为正常音量。 */
  volume?: number;
  sampleRate?: number;
  /** 是否将文本作为 SSML 处理。 */
  ssml?: boolean;
  /** 是否流式返回。 */
  stream?: boolean;
  maxLength?: number;
  useCache?: boolean;
  metadata?: Record<string, unknown>;
  /** 可注入的 fetch 实现，便于测试/自定义传输。 */
  fetchFn?: typeof fetch;
}

/** 文本转语音合成结果。 */
export interface TTSResult {
  audio: Buffer;
  format: AudioFormat;
  provider: string;
  voice: string;
  sampleRate?: number;
  durationMs?: number;
  cached?: boolean;
  metadata?: Record<string, unknown>;
}

/** 流式合成分块。 */
export interface TTSStreamChunk {
  audio: Buffer;
  sequence: number;
  isFinal: boolean;
  format: AudioFormat;
}

/** 传给 Provider 的归一化合成请求。 */
export interface SynthesizeRequest {
  text: string;
  config: ProviderConfig;
  voice?: string;
  language?: string;
  format?: AudioFormat;
  speed?: number;
  pitch?: number;
  volume?: number;
  sampleRate?: number;
  ssml?: boolean;
  timeoutMs?: number;
  /** 可注入的 fetch 实现，便于测试。 */
  fetchFn?: typeof fetch;
}

/** Provider 合成结果。 */
export interface SynthesizeResult {
  audio: Buffer;
  format: AudioFormat;
  sampleRate?: number;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

/** 列举声音请求。 */
export interface ListVoicesRequest {
  config?: ProviderConfig;
  fetchFn?: typeof fetch;
}

/** 指令覆盖策略，控制哪些字段可影响合成。 */
export interface DirectivePolicy {
  enabled: boolean;
  allowText: boolean;
  allowProvider: boolean;
  allowVoice: boolean;
  allowModel: boolean;
  allowVoiceSettings: boolean;
}

/** Provider 插件契约。 */
export interface TTSProviderPlugin {
  id: string;
  label: string;
  aliases?: string[];
  /** 自动选择排序权重，越小越优先。 */
  autoSelectOrder: number;
  languages: readonly string[];
  voices: readonly Voice[];
  defaultVoice: string;
  defaultModel: string;
  supportedFormats: readonly AudioFormat[];
  defaultFormat: AudioFormat;
  /** 该 Provider 是否已具备合成所需配置（如 API Key）。 */
  isConfigured(config: ProviderConfig): boolean;
  /** 执行一次性合成。 */
  synthesize(req: SynthesizeRequest): Promise<SynthesizeResult>;
  /** 列举可用声音。 */
  listVoices?(req?: ListVoicesRequest): Promise<Voice[]>;
}

/** 解析后的 SSML 结构。 */
export interface ParsedSsml {
  text: string;
  voice?: string;
  lang?: string;
  rate?: string;
  pitch?: string;
  volume?: string;
  marks: SsmlMark[];
}

/** SSML 标记位置。 */
export interface SsmlMark {
  name: string;
  textBefore: string;
}

/** 缓存统计。 */
export interface CacheStats {
  entries: number;
  hits: number;
  misses: number;
  evictions: number;
  bytes: number;
  hitRate: number;
}

/** 默认 TTS 配置，国内 Provider 优先。 */
export const DEFAULT_TTS_CONFIG: Required<
  Pick<
    TTSConfig,
    | 'provider'
    | 'defaultLanguage'
    | 'defaultFormat'
    | 'defaultSampleRate'
    | 'timeoutMs'
    | 'maxLength'
    | 'enableCache'
    | 'cacheMaxEntries'
    | 'cacheMaxBytes'
    | 'cacheTtlMs'
    | 'enableSsml'
    | 'streaming'
  >
> = {
  provider: 'auto',
  defaultLanguage: 'zh',
  defaultFormat: 'mp3',
  defaultSampleRate: 16000,
  timeoutMs: 30_000,
  maxLength: 1500,
  enableCache: true,
  cacheMaxEntries: 500,
  cacheMaxBytes: 50 * 1024 * 1024,
  cacheTtlMs: 30 * 60 * 1000,
  enableSsml: true,
  streaming: false,
};

/** 默认指令策略（全部允许）。 */
export const DEFAULT_DIRECTIVE_POLICY: DirectivePolicy = {
  enabled: true,
  allowText: true,
  allowProvider: true,
  allowVoice: true,
  allowModel: true,
  allowVoiceSettings: true,
};

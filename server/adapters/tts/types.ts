/**
 * TTS 适配器类型定义 — 可插拔语音合成 Provider 契约。
 *
 * 参考 openclaw/src/tts/provider-types.ts 的 SpeechProviderPlugin /
 * SpeechSynthesisRequest 形状，以及 server/adapters/types.ts 的适配器风格，
 * 移除插件/能力运行时耦合，保持模块自洽。Provider 实现统一通过
 * server/engine/tts/providers/shared.ts 的可注入 HTTP 工具发起请求。
 */

/** 支持的音频输出格式。 */
export type AudioFormat = 'mp3' | 'opus' | 'wav' | 'pcm' | 'aac' | 'ogg';

/** 内置 Provider 标识（与 OpenClaw 9 个 TTS 扩展对齐，按需启用）。 */
export type TTSProviderId =
  | 'openai'
  | 'elevenlabs'
  | 'azure-speech'
  | 'minimax'
  | 'volcengine'
  | 'xai'
  | 'microsoft';

/** 声音性别。 */
export type Gender = 'male' | 'female' | 'neutral';

/** 支持的音频格式清单。 */
export const AUDIO_FORMATS: readonly AudioFormat[] = ['mp3', 'opus', 'wav', 'pcm', 'aac', 'ogg'];

/**
 * Provider 连接与渲染配置。
 *
 * 通用字段覆盖 OpenAI 兼容端点；Provider 私有字段（如 region、appId、token、
 * voiceSettings）通过索引签名透传，由各适配器自行解释。
 */
export interface TTSConfig {
  /** API 端点基址，留空使用 Provider 默认。 */
  apiEndpoint?: string;
  apiKey?: string;
  /** 部分国内服务签名所需的 SecretKey（如腾讯云/讯飞风格）。 */
  secretKey?: string;
  /** 讯飞/火山风格 AppId。 */
  appId?: string;
  /** 火山引擎 legacy TTS token / BytePlus Seed Speech 资源 token。 */
  token?: string;
  /** 火山引擎 Seed Speech resourceId / appKey。 */
  resourceId?: string;
  appKey?: string;
  /** Azure / 火山引擎资源所在区域。 */
  region?: string;
  modelId?: string;
  voice?: string;
  language?: string;
  format?: AudioFormat;
  sampleRate?: number;
  /** 0.5 ~ 2.0，1.0 为正常语速。 */
  speed?: number;
  /** -6 ~ 6，0 为正常音调。 */
  pitch?: number;
  /** 0 ~ 100，50 为正常音量。 */
  volume?: number;
  timeoutMs?: number;
  /** 可注入的 fetch 实现，便于测试/自定义传输。 */
  fetchFn?: typeof fetch;
  /** 自定义请求头。 */
  extraHeaders?: Record<string, string>;
  /** 自定义请求体参数。 */
  extraBody?: Record<string, unknown>;
  [key: string]: unknown;
}

/** 声音元数据，用于 UI 选择器与 listVoices 返回。 */
export interface TTSVoice {
  id: string;
  name?: string;
  provider?: string;
  language?: string;
  locale?: string;
  gender?: Gender;
  description?: string;
  category?: string;
  personalities?: string[];
  sampleRate?: number;
}

/** 传给 Provider 的归一化合成请求。 */
export interface TTSSynthesizeRequest {
  text: string;
  config: TTSConfig;
}

/** Provider 合成结果。 */
export interface TTSAudioResult {
  audio: Buffer;
  format: AudioFormat;
  sampleRate?: number;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

/** 列举声音请求。 */
export interface TTSListVoicesRequest {
  config?: TTSConfig;
}

/** Provider 静态元数据（能力声明，供注册表与 UI 展示）。 */
export interface TTSProviderMetadata {
  id: TTSProviderId;
  label: string;
  aliases?: string[];
  /** 自动选择排序权重，越小越优先。 */
  autoSelectOrder: number;
  languages: readonly string[];
  voices: readonly TTSVoice[];
  defaultVoice: string;
  defaultModel: string;
  defaultFormat: AudioFormat;
  supportedFormats: readonly AudioFormat[];
}

/**
 * TTS Provider 契约。
 *
 * 每个 Provider 既是元数据声明，也是合成/列举声音的实现。注册表通过
 * TTSProviderFactory 惰性创建实例，避免启动时全量加载。
 */
export interface ITTSProvider extends TTSProviderMetadata {
  /** 该 Provider 是否已具备合成所需配置（如 API Key）。 */
  isConfigured(config: TTSConfig): boolean;
  /** 执行一次性合成。 */
  synthesize(req: TTSSynthesizeRequest): Promise<TTSAudioResult>;
  /** 列举可用声音；未配置凭证时返回内置预设。 */
  listVoices(req?: TTSListVoicesRequest): Promise<TTSVoice[]>;
}

/** Provider 工厂函数类型。 */
export type TTSProviderFactory = () => ITTSProvider;

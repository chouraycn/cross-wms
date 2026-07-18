/**
 * Music Generation 类型定义
 *
 * 参考 openclaw/src/music-generation/types.ts。
 * 定义音乐生成的请求、结果、Provider、能力声明等共享契约。
 */

/** 音频输出格式 */
export type AudioFormat = "mp3" | "wav" | "ogg" | "flac" | "aac";

/** 音乐风格大类 */
export type MusicStyle =
  | "classical"
  | "pop"
  | "electronic"
  | "jazz"
  | "folk"
  | "rock"
  | "hiphop"
  | "rnb"
  | "ambient"
  | "cinematic";

/** 情绪标签 */
export type MusicMood =
  | "happy"
  | "sad"
  | "epic"
  | "relaxed"
  | "energetic"
  | "dark"
  | "romantic"
  | "mysterious";

/** 节奏类型 */
export type MusicTempo = "slow" | "medium" | "fast" | "very-fast";

/** 生成的音乐资产 */
export type GeneratedMusicAsset = {
  buffer: Buffer;
  mimeType: string;
  fileName?: string;
  durationSeconds?: number;
  metadata?: Record<string, unknown>;
};

/** 音乐生成的源参考素材（例如参考音频/图片） */
export type MusicSourceAsset = {
  url?: string;
  buffer?: Buffer;
  mimeType?: string;
  fileName?: string;
  metadata?: Record<string, unknown>;
};

/** Provider 运行时请求 */
export type MusicRequest = {
  provider: string;
  model: string;
  prompt: string;
  timeoutMs?: number;
  lyrics?: string;
  instrumental?: boolean;
  durationSeconds?: number;
  format?: AudioFormat;
  style?: MusicStyle;
  mood?: MusicMood;
  tempo?: MusicTempo;
  instruments?: string[];
  inputAssets?: MusicSourceAsset[];
  providerOptions?: Record<string, unknown>;
  apiKey?: string;
  baseUrl?: string;
};

/** Provider 生成结果 */
export type MusicResult = {
  tracks: GeneratedMusicAsset[];
  model?: string;
  lyrics?: string[];
  metadata?: Record<string, unknown>;
};

/** Provider 生成模式能力 */
export type MusicModeCapabilities = {
  maxTracks?: number;
  maxDurationSeconds?: number;
  supportsLyrics?: boolean;
  supportsInstrumental?: boolean;
  supportsDuration?: boolean;
  supportsFormat?: boolean;
  supportedFormats?: readonly AudioFormat[];
  supportsStyle?: boolean;
  supportsMood?: boolean;
};

/** Provider 能力声明 */
export type MusicProviderCapabilities = MusicModeCapabilities & {
  generate?: MusicModeCapabilities;
  edit?: MusicModeCapabilities & {
    enabled: boolean;
    maxInputAssets?: number;
  };
};

/** Provider 接口契约 */
export type MusicGenerationProvider = {
  id: string;
  aliases?: string[];
  label?: string;
  defaultModel?: string;
  defaultTimeoutMs?: number;
  models?: string[];
  capabilities: MusicProviderCapabilities;
  isConfigured?: () => boolean;
  generateMusic: (req: MusicRequest) => Promise<MusicResult>;
};

/** 模型引用配置 */
export type MusicGenerationModelConfig = {
  /** Provider/model 形式，例如 "suno/suno-v4" */
  model?: string;
  fallbacks?: string[];
};

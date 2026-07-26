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
  supportsLyricsByModel?: Readonly<Record<string, boolean>>;
  supportsInstrumental?: boolean;
  supportsInstrumentalByModel?: Readonly<Record<string, boolean>>;
  supportsDuration?: boolean;
  supportsFormat?: boolean;
  supportedFormats?: readonly AudioFormat[];
  supportedFormatsByModel?: Readonly<Record<string, readonly AudioFormat[]>>;
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

// ---------------------------------------------------------------------------
// 兼容 openclaw 命名约定的类型别名
// （capabilities.ts / normalization.ts / runtime-types.ts 从 openclaw 移植而来）
// ---------------------------------------------------------------------------

/** 音乐生成模式：纯生成或基于输入素材编辑 */
export type MusicGenerationMode = "generate" | "edit";

/** 模式能力（openclaw 命名）- 等价于 MusicModeCapabilities */
export type MusicGenerationModeCapabilities = MusicModeCapabilities;

/** 编辑模式能力（openclaw 命名） */
export type MusicGenerationEditCapabilities = MusicModeCapabilities & {
  enabled: boolean;
  maxInputAssets?: number;
};

/** 被忽略的覆盖项（openclaw 命名） */
export type MusicGenerationIgnoredOverride = {
  key: string;
  value: unknown;
};

/** 归一化记录（openclaw 命名） */
export type MusicGenerationNormalization = {
  durationSeconds?: {
    requested: number;
    applied: number;
  };
};

/** 输出格式（openclaw 命名）- 等价于 AudioFormat */
export type MusicGenerationOutputFormat = AudioFormat;

/** 源图像/素材（openclaw 命名）- 等价于 MusicSourceAsset */
export type MusicGenerationSourceImage = MusicSourceAsset;

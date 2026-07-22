/**
 * Video Generation 类型定义
 *
 * 参考图像生成模块与 openclaw/src/video-generation/types.ts 的契约。
 */

/** 视频输出格式 */
export type VideoFormat = "mp4" | "webm" | "mov" | "gif";

/** 视频风格大类 */
export type VideoStyle =
  | "realistic"
  | "animation"
  | "cinematic"
  | "short-video"
  | "anime"
  | "3d"
  | "artistic";

/** 视频分辨率档位 */
export type VideoResolution = "360P" | "480P" | "540P" | "720P" | "1080P" | "4K";

/** 生成视频资产 */
export type GeneratedVideoAsset = {
  buffer?: Buffer;
  url?: string;
  mimeType: string;
  fileName?: string;
  durationSeconds?: number;
  width?: number;
  height?: number;
  metadata?: Record<string, unknown>;
};

/** 视频源素材（图生视频/视频生视频用） */
export type VideoSourceAsset = {
  url?: string;
  buffer?: Buffer;
  mimeType?: string;
  fileName?: string;
  // eslint-disable-next-line @typescript-eslint/ban-types
  role?: "first_frame" | "last_frame" | "reference_image" | "reference_video" | (string & {});
  metadata?: Record<string, unknown>;
};

/** Provider 运行时请求 */
export type VideoRequest = {
  provider: string;
  model: string;
  prompt: string;
  timeoutMs?: number;
  size?: string;
  aspectRatio?: string;
  resolution?: VideoResolution;
  durationSeconds?: number;
  fps?: number;
  audio?: boolean;
  watermark?: boolean;
  inputImages?: VideoSourceAsset[];
  inputVideos?: VideoSourceAsset[];
  providerOptions?: Record<string, unknown>;
  apiKey?: string;
  baseUrl?: string;
};

/** Provider 生成结果 */
export type VideoResult = {
  videos: GeneratedVideoAsset[];
  model?: string;
  metadata?: Record<string, unknown>;
};

/** 视频生成模式 */
export type VideoGenerationMode = "generate" | "imageToVideo" | "videoToVideo";

/** Provider 模式能力 */
export type VideoModeCapabilities = {
  maxVideos?: number;
  maxDurationSeconds?: number;
  supportedDurationSeconds?: readonly number[];
  sizes?: readonly string[];
  aspectRatios?: readonly string[];
  resolutions?: readonly VideoResolution[];
  supportsSize?: boolean;
  supportsAspectRatio?: boolean;
  supportsResolution?: boolean;
  supportsAudio?: boolean;
  supportsWatermark?: boolean;
  supportsFps?: boolean;
};

/** Provider 变换能力（图生视频/视频生视频） */
export type VideoTransformCapabilities = VideoModeCapabilities & {
  enabled: boolean;
  maxInputImages?: number;
  maxInputVideos?: number;
};

/** Provider 能力声明 */
export type VideoProviderCapabilities = VideoModeCapabilities & {
  generate?: VideoModeCapabilities;
  imageToVideo?: VideoTransformCapabilities;
  videoToVideo?: VideoTransformCapabilities;
};

/** Provider 接口契约 */
export type VideoGenerationProvider = {
  id: string;
  aliases?: string[];
  label?: string;
  defaultModel?: string;
  defaultTimeoutMs?: number;
  models?: string[];
  capabilities: VideoProviderCapabilities;
  isConfigured?: () => boolean;
  generateVideo: (req: VideoRequest) => Promise<VideoResult>;
};

/** 模型引用配置 */
export type VideoGenerationModelConfig = {
  model?: string;
  fallbacks?: string[];
};

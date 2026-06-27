/**
 * Shared image-generation request, provider, capability, and result contracts.
 *
 * 移植自 openclaw/src/image-generation/types.ts
 */

/** Binary image asset returned by an image-generation provider. */
export type GeneratedImageAsset = {
  buffer: Buffer;
  mimeType: string;
  fileName?: string;
  revisedPrompt?: string;
  metadata?: Record<string, unknown>;
};

export type ImageGenerationResolution = "1K" | "2K" | "4K";

export type ImageGenerationQuality = "low" | "medium" | "high" | "auto";

export type ImageGenerationOutputFormat = "png" | "jpeg" | "webp";

export type ImageGenerationBackground = "transparent" | "opaque" | "auto";

export type ImageGenerationOpenAIBackground = ImageGenerationBackground;

export type ImageGenerationOpenAIModeration = "low" | "auto";

export type ImageGenerationOpenAIOptions = {
  background?: ImageGenerationOpenAIBackground;
  moderation?: ImageGenerationOpenAIModeration;
  outputCompression?: number;
  user?: string;
};

export type ImageGenerationProviderOptions = Record<string, unknown> & {
  openai?: ImageGenerationOpenAIOptions;
};

type ImageGenerationIgnoredOverrideKey =
  | "size"
  | "aspectRatio"
  | "resolution"
  | "quality"
  | "outputFormat"
  | "background";

export type ImageGenerationIgnoredOverride = {
  key: ImageGenerationIgnoredOverrideKey;
  value: string;
};

export type ImageGenerationSourceImage = {
  buffer: Buffer;
  mimeType: string;
  fileName?: string;
  metadata?: Record<string, unknown>;
};

/** Runtime request passed to an image-generation provider implementation. */
export type ImageGenerationRequest = {
  provider: string;
  model: string;
  prompt: string;
  timeoutMs?: number;
  count?: number;
  size?: string;
  aspectRatio?: string;
  resolution?: ImageGenerationResolution;
  quality?: ImageGenerationQuality;
  outputFormat?: ImageGenerationOutputFormat;
  background?: ImageGenerationBackground;
  inputImages?: ImageGenerationSourceImage[];
  providerOptions?: ImageGenerationProviderOptions;
  apiKey?: string;
  baseUrl?: string;
};

export type ImageGenerationResult = {
  images: GeneratedImageAsset[];
  model?: string;
  metadata?: Record<string, unknown>;
};

type ImageGenerationModeCapabilities = {
  maxCount?: number;
  supportsSize?: boolean;
  supportsAspectRatio?: boolean;
  supportsResolution?: boolean;
};

type ImageGenerationEditCapabilities = ImageGenerationModeCapabilities & {
  enabled: boolean;
  maxInputImages?: number;
};

type ImageGenerationGeometryCapabilities = {
  sizes?: string[];
  sizesByModel?: Record<string, string[]>;
  aspectRatios?: string[];
  aspectRatiosByModel?: Record<string, string[]>;
  resolutions?: ImageGenerationResolution[];
  resolutionsByModel?: Record<string, ImageGenerationResolution[]>;
};

type ImageGenerationOutputCapabilities = {
  qualities?: ImageGenerationQuality[];
  formats?: ImageGenerationOutputFormat[];
  backgrounds?: ImageGenerationBackground[];
};

export type ImageGenerationNormalization = {
  size?: {
    requested: string | undefined;
    applied: string | undefined;
  };
  aspectRatio?: {
    requested: string | undefined;
    applied: string | undefined;
  };
  resolution?: {
    requested: ImageGenerationResolution | undefined;
    applied: ImageGenerationResolution | undefined;
  };
};

export type ImageGenerationProviderCapabilities = {
  generate: ImageGenerationModeCapabilities;
  edit: ImageGenerationEditCapabilities;
  geometry?: ImageGenerationGeometryCapabilities;
  output?: ImageGenerationOutputCapabilities;
};

export type ImageGenerationProvider = {
  id: string;
  aliases?: string[];
  label?: string;
  defaultModel?: string;
  defaultTimeoutMs?: number;
  models?: string[];
  capabilities: ImageGenerationProviderCapabilities;
  isConfigured?: () => boolean;
  generateImage: (req: ImageGenerationRequest) => Promise<ImageGenerationResult>;
};

/** 图片生成模型配置 */
export type ImageGenerationModelConfig = {
  /** Provider/model 格式，如 "openai/dall-e-3" */
  model?: string;
  /** 回退模型列表 */
  fallbacks?: string[];
};

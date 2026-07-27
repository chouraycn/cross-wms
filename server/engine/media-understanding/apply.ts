import type { OpenClawConfig } from "../config/types.openclaw.js";
import type { ModelsConfig } from "../config/types.models.js";
import { DEFAULT_MAX_BYTES, DEFAULT_TIMEOUT_SECONDS, MIN_AUDIO_FILE_BYTES } from "./defaults.constants.js";
import type { MediaUnderstandingCapability } from "./types.js";

export type ActiveMediaModel = {
  provider: string;
  model?: string;
};

export type MediaModelConfig = {
  image?: ActiveMediaModel;
  audio?: ActiveMediaModel;
  video?: ActiveMediaModel;
  [key: string]: unknown;
};

export type NormalizedMediaToolConfig = {
  enabled: boolean;
  timeoutSeconds: number;
  maxBytes: number;
  maxChars: number | undefined;
  prompt: string | undefined;
  language: string | undefined;
  preferRemoteFallback: boolean;
  concurrency: number;
  _requestPromptOverride?: string;
  _requestLanguageOverride?: string;
};

function resolveImageConfig(
  cfg: OpenClawConfig,
  overrides?: Partial<NormalizedMediaToolConfig>,
): NormalizedMediaToolConfig {
  const imageCfg = cfg.tools?.media?.image as Partial<NormalizedMediaToolConfig> | undefined;
  return {
    enabled: imageCfg?.enabled ?? true,
    timeoutSeconds: imageCfg?.timeoutSeconds ?? overrides?.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS,
    maxBytes: imageCfg?.maxBytes ?? overrides?.maxBytes ?? DEFAULT_MAX_BYTES.image,
    maxChars: imageCfg?.maxChars ?? overrides?.maxChars ?? undefined,
    prompt: imageCfg?.prompt ?? overrides?.prompt ?? undefined,
    language: imageCfg?.language ?? overrides?.language ?? undefined,
    preferRemoteFallback: imageCfg?.preferRemoteFallback ?? overrides?.preferRemoteFallback ?? false,
    concurrency: imageCfg?.concurrency ?? overrides?.concurrency ?? 3,
    _requestPromptOverride: imageCfg?._requestPromptOverride ?? overrides?._requestPromptOverride,
    _requestLanguageOverride: imageCfg?._requestLanguageOverride ?? overrides?._requestLanguageOverride,
  };
}

function resolveAudioConfig(
  cfg: OpenClawConfig,
  overrides?: Partial<NormalizedMediaToolConfig>,
): NormalizedMediaToolConfig {
  const audioCfg = cfg.tools?.media?.audio as Partial<NormalizedMediaToolConfig> | undefined;
  return {
    enabled: audioCfg?.enabled ?? true,
    timeoutSeconds: audioCfg?.timeoutSeconds ?? overrides?.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS,
    maxBytes: audioCfg?.maxBytes ?? overrides?.maxBytes ?? DEFAULT_MAX_BYTES.audio,
    maxChars: audioCfg?.maxChars ?? overrides?.maxChars ?? undefined,
    prompt: audioCfg?.prompt ?? overrides?.prompt ?? undefined,
    language: audioCfg?.language ?? overrides?.language ?? undefined,
    preferRemoteFallback: audioCfg?.preferRemoteFallback ?? overrides?.preferRemoteFallback ?? false,
    concurrency: audioCfg?.concurrency ?? overrides?.concurrency ?? 3,
    _requestPromptOverride: audioCfg?._requestPromptOverride ?? overrides?._requestPromptOverride,
    _requestLanguageOverride: audioCfg?._requestLanguageOverride ?? overrides?._requestLanguageOverride,
  };
}

function resolveVideoConfig(
  cfg: OpenClawConfig,
  overrides?: Partial<NormalizedMediaToolConfig>,
): NormalizedMediaToolConfig {
  const videoCfg = cfg.tools?.media?.video as Partial<NormalizedMediaToolConfig> | undefined;
  return {
    enabled: videoCfg?.enabled ?? true,
    timeoutSeconds: videoCfg?.timeoutSeconds ?? overrides?.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS,
    maxBytes: videoCfg?.maxBytes ?? overrides?.maxBytes ?? DEFAULT_MAX_BYTES.video,
    maxChars: videoCfg?.maxChars ?? overrides?.maxChars ?? undefined,
    prompt: videoCfg?.prompt ?? overrides?.prompt ?? undefined,
    language: videoCfg?.language ?? overrides?.language ?? undefined,
    preferRemoteFallback: videoCfg?.preferRemoteFallback ?? overrides?.preferRemoteFallback ?? false,
    concurrency: videoCfg?.concurrency ?? overrides?.concurrency ?? 3,
    _requestPromptOverride: videoCfg?._requestPromptOverride ?? overrides?._requestPromptOverride,
    _requestLanguageOverride: videoCfg?._requestLanguageOverride ?? overrides?._requestLanguageOverride,
  };
}

export function resolveMediaConfig(
  cfg: OpenClawConfig,
  capability: MediaUnderstandingCapability,
  overrides?: Partial<NormalizedMediaToolConfig>,
): NormalizedMediaToolConfig {
  switch (capability) {
    case "image":
      return resolveImageConfig(cfg, overrides);
    case "audio":
      return resolveAudioConfig(cfg, overrides);
    case "video":
      return resolveVideoConfig(cfg, overrides);
    default:
      return resolveImageConfig(cfg, overrides);
  }
}

export function resolveActiveMediaModel(
  cfg: OpenClawConfig,
  capability?: MediaUnderstandingCapability,
): ActiveMediaModel | undefined {
  const models = cfg.models as Record<string, unknown> | undefined;
  const mediaModel = models?.media as MediaModelConfig | undefined;
  if (!mediaModel) {
    return undefined;
  }

  let activeModel: ActiveMediaModel | undefined;
  if (capability && mediaModel[capability]) {
    activeModel = mediaModel[capability] as ActiveMediaModel;
  } else if (mediaModel.image) {
    activeModel = mediaModel.image as ActiveMediaModel;
  }

  return activeModel;
}

export function isMediaEnabled(cfg: OpenClawConfig, capability: MediaUnderstandingCapability): boolean {
  const mediaCfg = resolveMediaConfig(cfg, capability);
  return mediaCfg.enabled;
}

export function resolveMinFileBytes(capability: MediaUnderstandingCapability): number {
  if (capability === "audio") {
    return MIN_AUDIO_FILE_BYTES;
  }
  return 1;
}

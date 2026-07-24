// Media-generation module — simplified port from openclaw/src/media-generation/.
//
// 仅导出 runtime-shared 中的纯工具函数。完整的 provider/model 自动回退、
// auth-profile 集成与 capability-model-ref 解析见 openclaw 源码。
export {
  MAX_TIMER_TIMEOUT_MS,
  clampTimerTimeoutMs,
  resolveMediaProviderDefaultTimeoutMs,
  resolveMediaProviderRequestTimeoutMs,
  deriveAspectRatioFromSize,
  resolveClosestAspectRatio,
  resolveClosestSize,
  resolveClosestResolution,
  normalizeDurationToClosestMax,
  recordCapabilityCandidateFailure,
  throwCapabilityGenerationFailure,
  buildMediaGenerationNormalizationMetadata,
  buildNoCapabilityModelConfiguredMessage,
} from "./runtime-shared.js";

export type {
  ParsedProviderModelRef,
  FallbackAttempt,
  MediaNormalizationEntry,
  MediaGenerationNormalizationMetadataInput,
} from "./runtime-shared.js";

/**
 * Video Generation 模块 — 视频生成 barrel 导出
 *
 * 聚合所有视频生成子模块的公开 API。
 */

// Provider 注册表
export {
  registerVideoProvider,
  unregisterVideoProvider,
  listVideoProviders,
  listConfiguredVideoProviders,
  getVideoProvider,
  getDefaultVideoProvider,
  clearVideoProviders,
} from "./provider-registry.js";

// 类型
export type {
  VideoFormat,
  VideoStyle,
  VideoResolution,
  GeneratedVideoAsset,
  VideoSourceAsset,
  VideoRequest,
  VideoResult,
  VideoGenerationMode,
  VideoModeCapabilities,
  VideoTransformCapabilities,
  VideoProviderCapabilities,
  VideoGenerationProvider,
  VideoGenerationModelConfig,
} from "./types.js";

// 风格预设
export {
  listStylePresets,
  getStylePreset,
  applyStyleToPrompt,
  listStyleCategories,
  searchStylePresets,
} from "./style-preset.js";

export type { VideoStylePreset } from "./style-preset.js";

// Prompt 工程
export {
  detectPromptLanguage,
  translateChinesePrompt,
  enhancePrompt,
  buildPromptFromParts,
  sanitizePrompt,
  truncatePrompt,
  mergePrompts,
  extractPromptKeywords,
  createPromptVariations,
} from "./prompt-engineering.js";

export type {
  PromptLanguage,
  VideoPromptEnhanceOptions,
  EnhancedVideoPrompt,
} from "./prompt-engineering.js";

// 生成器核心
export {
  generateVideo,
  generateWithMultipleStyles,
  estimateGenerationCost,
  parseModelRef,
  clearVideoHistory,
  getVideoHistory,
} from "./generator.js";

export type {
  GenerateVideoParams,
  GenerateVideoResult,
  GenerateWithMultipleStylesParams,
  MultiStyleVideoResult,
} from "./generator.js";

// 视频编辑器
export {
  validateClips,
  estimateEditDuration,
  trimClip,
  applyTransitions,
  validateEditOptions,
  editClips,
  listOutputFormats,
} from "./video-editor.js";

export type {
  VideoClip,
  VideoEditOptions,
  VideoEditResult,
} from "./video-editor.js";

// 帧提取器
export {
  validateExtractionOptions,
  computeFrameTimestamps,
  pickEvenlySpacedFrames,
  qualityToScale,
  formatToMimeType,
  extractFrames,
  estimateFrameCount,
} from "./frame-extractor.js";

export type {
  FrameExtractionOptions,
  ExtractedFrame,
  FrameExtractionResult,
} from "./frame-extractor.js";

// Providers 集合
export {
  createRunwayProvider,
  runwayProvider,
  createPikaProvider,
  pikaProvider,
  createSoraProvider,
  soraProvider,
  createKlingProvider,
  klingProvider,
  createHunyuanVideoProvider,
  hunyuanVideoProvider,
} from "./providers/index.js";

export type {
  RunwayModel,
  RunwayProviderOptions,
  PikaModel,
  PikaProviderOptions,
  SoraModel,
  SoraProviderOptions,
  KlingModel,
  KlingProviderOptions,
  HunyuanVideoModel,
  HunyuanVideoProviderOptions,
} from "./providers/index.js";

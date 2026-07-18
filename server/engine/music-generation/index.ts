/**
 * Music Generation 模块 — 音乐生成 barrel 导出
 *
 * 聚合所有音乐生成子模块的公开 API。
 */

// Provider 注册表
export {
  registerMusicProvider,
  unregisterMusicProvider,
  listMusicProviders,
  listConfiguredMusicProviders,
  getMusicProvider,
  getDefaultMusicProvider,
  clearMusicProviders,
} from "./provider-registry.js";

// 类型
export type {
  AudioFormat,
  MusicStyle,
  MusicMood,
  MusicTempo,
  GeneratedMusicAsset,
  MusicSourceAsset,
  MusicRequest,
  MusicResult,
  MusicModeCapabilities,
  MusicProviderCapabilities,
  MusicGenerationProvider,
  MusicGenerationModelConfig,
} from "./types.js";

// 风格预设
export {
  listStylePresets,
  getStylePreset,
  applyStyleToPrompt,
  listStyleCategories,
  searchStylePresets,
} from "./style-preset.js";

export type { MusicStylePreset } from "./style-preset.js";

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
  MusicPromptEnhanceOptions,
  EnhancedMusicPrompt,
} from "./prompt-engineering.js";

// 生成器核心
export {
  generateMusic,
  generateWithMultipleStyles,
  estimateGenerationCost,
  parseModelRef,
  clearMusicHistory,
  getMusicHistory,
} from "./generator.js";

export type {
  GenerateMusicParams,
  GenerateMusicResult,
  GenerateWithMultipleStylesParams,
  MultiStyleMusicResult,
} from "./generator.js";

// 音频混音器
export {
  validateMixTracks,
  estimateMixDuration,
  calculateVolumeCurve,
  normalizeVolume,
  applyCrossfade,
  clipTrack,
  mixTracks,
  listMixFormats,
  validateMixOptions,
} from "./audio-mixer.js";

export type {
  MixTrack,
  MixOptions,
  MixResult,
} from "./audio-mixer.js";

// Providers 集合
export {
  createSunoProvider,
  sunoProvider,
  createUdioProvider,
  udioProvider,
  createTencentMusicProvider,
  tencentMusicProvider,
  createStableAudioProvider,
  stableAudioProvider,
} from "./providers/index.js";

export type {
  SunoModel,
  SunoProviderOptions,
  UdioModel,
  UdioProviderOptions,
  TencentMusicModel,
  TencentMusicProviderOptions,
  StableAudioModel,
  StableAudioProviderOptions,
} from "./providers/index.js";

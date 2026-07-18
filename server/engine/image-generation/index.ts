/**
 * Image Generation 模块 — 图像生成 barrel 导出
 *
 * 聚合所有图像生成子模块的公开 API。
 */

// Provider 注册表
export {
  registerImageGenerationProvider,
  unregisterImageGenerationProvider,
  listImageGenerationProviders,
  listConfiguredImageGenerationProviders,
  getImageGenerationProvider,
  getDefaultImageGenerationProvider,
} from "./provider-registry.js";

// 类型
export type {
  GeneratedImageAsset,
  ImageGenerationResolution,
  ImageGenerationQuality,
  ImageGenerationOutputFormat,
  ImageGenerationBackground,
  ImageGenerationOpenAIBackground,
  ImageGenerationOpenAIModeration,
  ImageGenerationOpenAIOptions,
  ImageGenerationProviderOptions,
  ImageGenerationIgnoredOverride,
  ImageGenerationSourceImage,
  ImageGenerationRequest,
  ImageGenerationResult,
  ImageGenerationNormalization,
  ImageGenerationProviderCapabilities,
  ImageGenerationProvider,
  ImageGenerationModelConfig,
} from "./types.js";

// 图片资产工具
export {
  parseOpenAiCompatibleImageResponse,
  sniffImageMimeType,
  getImageExtension,
  saveGeneratedImages,
  createImageAsset,
  getImageAssetFromCache,
  setImageAssetCache,
  clearImageCache,
  getCacheStats,
  generateFileName,
  compareImageAssets,
  calculateImageHash,
  cloneImageAsset,
  validateImageAsset,
  formatFileSize,
  loadImageFromFile,
} from "./image-assets.js";

export type {
  ImageAssetMetadata,
  ImageAsset,
} from "./image-assets.js";

// 模型引用解析
export { parseImageGenerationModelRef } from "./model-ref.js";

// 覆盖参数归一化
export { resolveImageGenerationOverrides } from "./normalization.js";

// OpenAI 兼容 Provider 工厂
export {
  createOpenAiCompatibleImageProvider,
  type OpenAiCompatibleImageProviderOptions,
} from "./openai-compatible-image-provider.js";

// Runtime 入口
export {
  generateImage,
  listRuntimeImageGenerationProviders,
  type GenerateImageParams,
  type GenerateImageRuntimeResult,
  type ListRuntimeImageGenerationProvidersParams,
} from "./runtime.js";

// 尺寸预设
export {
  listSizePresets,
  getSizePreset,
  parseSizeString,
  formatSizeString,
  getAspectRatio,
  getClosestSizePreset,
  listSizeCategories,
} from "./size-preset.js";

export type {
  ImageSizeCategory,
  ImageSizePreset,
} from "./size-preset.js";

// 风格预设
export {
  listStylePresets,
  getStylePreset,
  applyStyleToPrompt,
  listStyleCategories,
  searchStylePresets,
} from "./style-preset.js";

export type {
  ImageStyleCategory,
  ImageStylePreset,
} from "./style-preset.js";

// Prompt 工程优化
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
  PromptEnhanceOptions,
  EnhancedPrompt,
} from "./prompt-engineering.js";

// 图像生成器核心
export {
  generateWithPresets,
  generateVariants,
  generateWithMultipleStyles,
  estimateGenerationCost,
} from "./generator.js";

export type {
  GenerateWithPresetsParams,
  GenerateWithPresetsResult,
  GenerateVariantParams,
  GenerateWithMultipleStylesParams,
  MultiStyleResult,
} from "./generator.js";

// 图像编辑
export {
  createMaskFromAlpha,
  resizeMask,
  blurMask,
  invertMask,
  createOutpaintMask,
  inpaintImage,
  outpaintImage,
  generateVariation,
  transformImage,
  getImageInfo,
  validateInpaintRequest,
  validateOutpaintRequest,
  validateVariationRequest,
} from "./image-editor.js";

export type {
  InpaintRequest,
  OutpaintRequest,
  VariationRequest,
  ImageEditResult,
  ImageTransform,
} from "./image-editor.js";

// 图像放大增强
export {
  getUpscaleDimensions,
  estimateUpscaleDuration,
  getUpscaleMemoryEstimate,
  upscaleImage,
  upscaleGeneratedImages,
  listUpscaleProviders,
  validateUpscaleOptions,
} from "./upscaler.js";

export type {
  UpscaleScale,
  UpscaleMode,
  UpscaleOptions,
  UpscaleResult,
} from "./upscaler.js";

// 水印处理
export {
  getWatermarkPositionCoords,
  addTextWatermark,
  addWatermark,
  addWatermarkToGeneratedImages,
  addTileWatermark,
  detectWatermark,
  removeWatermark,
  listWatermarkPositions,
  validateWatermarkOptions,
} from "./watermark.js";

export type {
  WatermarkPosition,
  WatermarkType,
  TextWatermarkOptions,
  ImageWatermarkOptions,
  WatermarkOptions,
  TileWatermarkOptions,
  WatermarkResult,
} from "./watermark.js";

// NSFW 安全检测
export {
  checkPromptForNSFW,
  checkImageForNSFW,
  checkGeneratedImages,
  getNSFWScores,
  filterUnsafeImages,
  listNSFWCategories,
  validateNSFWCheckOptions,
  getNSFWLevelLabel,
} from "./nsfw-checker.js";

export type {
  NSFWCategory,
  NSFWLevel,
  NSFWDetectionResult,
  NSFWCheckOptions,
  PromptNSFWCheckResult,
} from "./nsfw-checker.js";

// 生成历史记录
export {
  addToGenerationHistory,
  getGenerationHistory,
  getGenerationHistoryItem,
  updateGenerationHistoryItem,
  deleteGenerationHistoryItem,
  clearGenerationHistory,
  toggleFavorite,
  addTags,
  removeTags,
  getHistoryStats,
  searchHistoryByPrompt,
  getHistoryHistoryCount,
} from "./generation-history.js";

export type {
  GenerationHistoryRecord,
  HistoryQueryParams,
  HistoryStats,
} from "./generation-history.js";

// 批量生成管理
export {
  createBatch,
  getBatch,
  listBatches,
  getBatchProgress,
  startBatch,
  pauseBatch,
  resumeBatch,
  cancelBatch,
  removeBatch,
  onBatchProgress,
  getBatchStats,
  clearCompletedBatches,
} from "./batch-manager.js";

export type {
  BatchStatus,
  BatchItemStatus,
  BatchTask,
  BatchItem,
  CreateBatchOptions,
  BatchProgress,
} from "./batch-manager.js";

// Providers 集合
export {
  createDiffusersProvider,
  diffusersProvider,
  createStabilityAIProvider,
  stabilityAIProvider,
  createMidjourneyProvider,
  midjourneyProvider,
  createWanxiangProvider,
  wanxiangProvider,
  listWanxiangStyles,
  createHunyuanProvider,
  hunyuanProvider,
} from "./providers/index.js";

export type {
  DiffusersModelType,
  DiffusersProviderOptions,
  StabilityAIModel,
  StabilityAIProviderOptions,
  MidjourneyAction,
  MidjourneyAspectRatio,
  MidjourneyModel,
  MidjourneyProviderOptions,
  WanxiangStyle,
  WanxiangSize,
  WanxiangProviderOptions,
  HunyuanModel,
  HunyuanProviderOptions,
} from "./providers/index.js";

// 国内 Provider 自动注册（副作用导入）
import "./chinese-providers.js";

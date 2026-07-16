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

// 国内 Provider 自动注册（副作用导入）
import "./chinese-providers.js";

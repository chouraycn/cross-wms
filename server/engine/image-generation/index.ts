/**
 * Image Generation 模块 - 图像生成
 */

export {
  registerImageGenerationProvider,
  unregisterImageGenerationProvider,
  listImageGenerationProviders,
  getImageGenerationProvider,
  getDefaultImageGenerationProvider,
} from './provider-registry.js';

export type {
  GeneratedImageAsset,
  ImageGenerationRequest,
  ImageGenerationResult,
} from './types.js';
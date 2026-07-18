/**
 * Image Generation Providers — 图像生成 Provider 集合
 *
 * 聚合所有图像生成 Provider 的导出。
 */

export { createDiffusersProvider, diffusersProvider } from "./diffusers.js";
export type {
  DiffusersModelType,
  DiffusersProviderOptions,
} from "./diffusers.js";

export { createStabilityAIProvider, stabilityAIProvider } from "./stability.js";
export type {
  StabilityAIModel,
  StabilityAIProviderOptions,
} from "./stability.js";

export { createMidjourneyProvider, midjourneyProvider } from "./midjourney.js";
export type {
  MidjourneyAction,
  MidjourneyAspectRatio,
  MidjourneyModel,
  MidjourneyProviderOptions,
} from "./midjourney.js";

export {
  createWanxiangProvider,
  wanxiangProvider,
  listWanxiangStyles,
} from "./wanx.js";
export type {
  WanxiangStyle,
  WanxiangSize,
  WanxiangProviderOptions,
} from "./wanx.js";

export { createHunyuanProvider, hunyuanProvider } from "./hunyuan.js";
export type {
  HunyuanModel,
  HunyuanProviderOptions,
} from "./hunyuan.js";

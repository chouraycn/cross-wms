/**
 * Video Generation Providers — 视频生成 Provider 集合
 *
 * 聚合所有视频生成 Provider 的导出。
 */

export { createRunwayProvider, runwayProvider } from "./runway.js";
export type { RunwayModel, RunwayProviderOptions } from "./runway.js";

export { createPikaProvider, pikaProvider } from "./pika.js";
export type { PikaModel, PikaProviderOptions } from "./pika.js";

export { createSoraProvider, soraProvider } from "./sora.js";
export type { SoraModel, SoraProviderOptions } from "./sora.js";

export { createKlingProvider, klingProvider } from "./kling.js";
export type { KlingModel, KlingProviderOptions } from "./kling.js";

export { createHunyuanVideoProvider, hunyuanVideoProvider } from "./hunyuan-video.js";
export type {
  HunyuanVideoModel,
  HunyuanVideoProviderOptions,
} from "./hunyuan-video.js";

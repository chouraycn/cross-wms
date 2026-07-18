/**
 * Music Generation Providers — 音乐生成 Provider 集合
 *
 * 聚合所有音乐生成 Provider 的导出。
 */

export { createSunoProvider, sunoProvider } from "./suno.js";
export type { SunoModel, SunoProviderOptions } from "./suno.js";

export { createUdioProvider, udioProvider } from "./udio.js";
export type { UdioModel, UdioProviderOptions } from "./udio.js";

export { createTencentMusicProvider, tencentMusicProvider } from "./tencent-music.js";
export type {
  TencentMusicModel,
  TencentMusicProviderOptions,
} from "./tencent-music.js";

export { createStableAudioProvider, stableAudioProvider } from "./stable-audio.js";
export type {
  StableAudioModel,
  StableAudioProviderOptions,
} from "./stable-audio.js";

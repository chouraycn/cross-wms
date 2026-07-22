/**
 * TTS 适配器 barrel — 统一导出类型、注册表与所有内置 Provider。
 *
 * 镜像 server/adapters/registry.ts 的 initBuiltinAdapters 模式：仅注册惰性
 * 加载器（动态 import()），实际 Provider 模块在首次 getTtsProvider 调用时才
 * 导入，避免启动时全量加载 7 个 TTS 扩展。调用方通过 getTtsProvider(id) 获取
 * 已实例化的 ITTSProvider，元数据查询使用 listTtsProviderMetadata。
 */

// 类型与注册表
export type {
  AudioFormat,
  TTSProviderId,
  Gender,
  TTSConfig,
  TTSVoice,
  TTSSynthesizeRequest,
  TTSAudioResult,
  TTSListVoicesRequest,
  TTSProviderMetadata,
  ITTSProvider,
  TTSProviderFactory,
} from './types.js';
export { AUDIO_FORMATS } from './types.js';

export {
  normalizeProviderId,
  registerTtsProvider,
  getTtsProvider,
  hasTtsProvider,
  listTtsProviderIds,
  listTtsProviderMetadata,
  resetTtsRegistry,
} from './registry.js';

// 各 Provider 的导出辅助函数与工厂（供测试或直接调用）
export { buildOpenAiTtsRequest, createOpenAiTtsProvider, openAiTtsFactory } from './openaiTts.js';
export { createElevenLabsTtsProvider, elevenLabsTtsFactory } from './elevenlabsTts.js';
export { buildAzureSsml, createAzureTtsProvider, azureTtsFactory } from './azureTts.js';
export { createMinimaxTtsProvider, minimaxTtsFactory } from './minimaxTts.js';
export { createVolcengineTtsProvider, volcengineTtsFactory } from './volcengineTts.js';
export { createXaiTtsProvider, xaiTtsFactory } from './xaiTts.js';
export { buildEdgeSsml, createMicrosoftTtsProvider, microsoftTtsFactory } from './microsoftTts.js';

import { logger } from '../../logger.js';
import { registerTtsProvider } from './registry.js';

/**
 * 初始化内置 TTS Provider — 注册惰性加载器（函数引用），实际模块在首次
 * getTtsProvider 调用时才动态 import。可安全重复调用（覆盖式注册）。
 *
 * 注册顺序与 autoSelectOrder 无关；autoSelectOrder 由 Provider 元数据声明，
 * 供需要自动选择 Provider 的调用方排序使用。
 */
export function initBuiltinTtsProviders(): void {
  registerTtsProvider(
    'openai',
    async () => {
      const m = await import('./openaiTts.js');
      return m.openAiTtsFactory;
    },
    ['azure-openai', 'openai-tts'],
  );

  registerTtsProvider(
    'elevenlabs',
    async () => {
      const m = await import('./elevenlabsTts.js');
      return m.elevenLabsTtsFactory;
    },
    ['eleven'],
  );

  registerTtsProvider(
    'microsoft',
    async () => {
      const m = await import('./microsoftTts.js');
      return m.microsoftTtsFactory;
    },
    ['edge', 'edge-tts', 'azure-edge'],
  );

  registerTtsProvider(
    'azure-speech',
    async () => {
      const m = await import('./azureTts.js');
      return m.azureTtsFactory;
    },
    ['azure', 'azure-tts'],
  );

  registerTtsProvider(
    'minimax',
    async () => {
      const m = await import('./minimaxTts.js');
      return m.minimaxTtsFactory;
    },
    ['minimax-tts'],
  );

  registerTtsProvider(
    'volcengine',
    async () => {
      const m = await import('./volcengineTts.js');
      return m.volcengineTtsFactory;
    },
    ['byteplus', 'doubao-tts', '火山引擎'],
  );

  registerTtsProvider(
    'xai',
    async () => {
      const m = await import('./xaiTts.js');
      return m.xaiTtsFactory;
    },
    ['x-ai', 'grok-tts'],
  );

  logger.info('[TtsAdapters] 内置 TTS Provider 惰性注册完成 (7 providers)');
}

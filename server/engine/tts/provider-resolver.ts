/**
 * Provider 解析器 — 根据配置、语言、声音与可用性选择最优 Provider。
 *
 * 参考 openclaw/src/tts/directives.ts 中 prioritizeProvider/buildProviderOrder
 * 思路：显式指定 > 配置默认 > 声音匹配 > 语言匹配 > autoSelectOrder。
 */

import type {
  AudioFormat,
  ProviderConfig,
  TTSConfig,
  TTSProviderPlugin,
  TTSRequest,
} from './types.js';
import type { ProviderRegistry } from './provider-registry.js';

/** 从 TTSConfig 中取出指定 Provider 的配置。 */
export function getProviderConfig(
  config: TTSConfig | undefined,
  providerId: string,
): ProviderConfig {
  const raw = config?.providers?.[providerId];
  if (raw && typeof raw === 'object') return raw as ProviderConfig;
  return {};
}

/** 按 autoSelectOrder 升序排列 Provider，相同 order 按 id 字典序。 */
export function sortByAutoSelectOrder(
  providers: readonly TTSProviderPlugin[],
): TTSProviderPlugin[] {
  return [...providers].sort((a, b) => {
    const diff = (a.autoSelectOrder ?? Number.MAX_SAFE_INTEGER) - (b.autoSelectOrder ?? Number.MAX_SAFE_INTEGER);
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });
}

/** 列举所有已配置（可用）的 Provider。 */
export function listConfiguredProviders(
  registry: ProviderRegistry,
  config: TTSConfig | undefined,
): TTSProviderPlugin[] {
  return registry.list().filter((p) => {
    const providerConfig = getProviderConfig(config, p.id);
    if (providerConfig.enabled === false) return false;
    return p.isConfigured(providerConfig);
  });
}

/**
 * 选择适配目标语言的已配置 Provider。
 * 优先选择声明支持该语言的 Provider；若无，回退到 autoSelectOrder 最小者。
 */
export function selectProviderForLanguage(
  registry: ProviderRegistry,
  config: TTSConfig | undefined,
  language?: string,
): TTSProviderPlugin | undefined {
  const configured = listConfiguredProviders(registry, config);
  if (configured.length === 0) return undefined;
  if (language) {
    const langMatch = configured.filter((p) => p.languages.includes(language));
    if (langMatch.length > 0) return sortByAutoSelectOrder(langMatch)[0];
  }
  return sortByAutoSelectOrder(configured)[0];
}

/**
 * 解析最终使用的 Provider。
 *
 * 优先级：
 * 1. 请求显式指定（非 auto）→ 必须已注册；若未配置仍返回，由合成阶段抛错
 * 2. 配置默认 provider（非 auto）→ 若已配置则使用
 * 3. 请求声音所属 Provider（若能匹配到已配置 Provider）
 * 4. 按语言匹配的已配置 Provider
 * 5. autoSelectOrder 最小的已配置 Provider
 */
export function resolveProvider(
  config: TTSConfig | undefined,
  request: TTSRequest,
  registry: ProviderRegistry,
): TTSProviderPlugin {
  // 1. 请求显式指定
  if (request.provider && request.provider !== 'auto') {
    const explicit = registry.get(request.provider);
    if (explicit) return explicit;
    throw new Error(`未知的 TTS Provider: ${request.provider}`);
  }

  // 2. 配置默认（非 auto）
  const configuredDefault = config?.provider;
  if (configuredDefault && configuredDefault !== 'auto') {
    const plugin = registry.get(configuredDefault);
    if (plugin) {
      const pc = getProviderConfig(config, plugin.id);
      if (plugin.isConfigured(pc) && pc.enabled !== false) return plugin;
    }
  }

  // 3. 请求声音所属 Provider
  if (request.voice) {
    const voiceOwner = registry
      .list()
      .find((p) => p.voices.some((v) => v.id === request.voice));
    if (voiceOwner) {
      const pc = getProviderConfig(config, voiceOwner.id);
      if (voiceOwner.isConfigured(pc) && pc.enabled !== false) return voiceOwner;
    }
  }

  // 4. 语言匹配
  const language = request.language ?? config?.defaultLanguage;
  const byLanguage = selectProviderForLanguage(registry, config, language);
  if (byLanguage) return byLanguage;

  // 5. 兜底：任意已注册 Provider
  const any = registry.list()[0];
  if (any) return any;
  throw new Error('没有可用的 TTS Provider');
}

/** 解析最终使用的声音 ID。 */
export function resolveVoice(
  provider: TTSProviderPlugin,
  config: TTSConfig | undefined,
  request: TTSRequest,
): string {
  if (request.voice) return request.voice;
  const providerConfig = getProviderConfig(config, provider.id);
  if (providerConfig.voice) return providerConfig.voice;
  if (config?.defaultVoice) return config.defaultVoice;
  return provider.defaultVoice;
}

/** 解析最终使用的音频格式。 */
export function resolveFormat(
  provider: TTSProviderPlugin,
  config: TTSConfig | undefined,
  request: TTSRequest,
): AudioFormat {
  if (request.format && provider.supportedFormats.includes(request.format)) {
    return request.format;
  }
  const providerConfig = getProviderConfig(config, provider.id);
  if (providerConfig.format && provider.supportedFormats.includes(providerConfig.format)) {
    return providerConfig.format;
  }
  if (config?.defaultFormat && provider.supportedFormats.includes(config.defaultFormat)) {
    return config.defaultFormat;
  }
  return provider.defaultFormat;
}

/** 解析最终使用的采样率。 */
export function resolveSampleRate(
  config: TTSConfig | undefined,
  request: TTSRequest,
): number {
  return request.sampleRate ?? config?.defaultSampleRate ?? 16000;
}

/** 一次解析合成所需的全部参数。 */
export interface ResolvedSynthesis {
  provider: TTSProviderPlugin;
  providerConfig: ProviderConfig;
  voice: string;
  format: AudioFormat;
  sampleRate: number;
}

/** 解析合成所需的全部参数（Provider、声音、格式、采样率）。 */
export function resolveSynthesisParams(
  config: TTSConfig | undefined,
  request: TTSRequest,
  registry: ProviderRegistry,
): ResolvedSynthesis {
  const provider = resolveProvider(config, request, registry);
  return {
    provider,
    providerConfig: getProviderConfig(config, provider.id),
    voice: resolveVoice(provider, config, request),
    format: resolveFormat(provider, config, request),
    sampleRate: resolveSampleRate(config, request),
  };
}

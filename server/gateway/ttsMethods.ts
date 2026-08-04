/**
 * TTS Gateway Methods — 文本转语音 RPC 方法
 *
 * 架构定位：
 * - 参考 openclaw/src/gateway/server-methods/tts.ts
 * - 精简版：实现 status / providers / personas / enable / disable / convert /
 *   setProvider / setPersona 共 8 个方法
 * - Provider 发现与合成复用 server/adapters/tts 注册表（与 REST /api/tts 共用）
 * - 偏好状态（enabled / 当前 provider / 当前 voice）使用内存态，未持久化到磁盘
 */

import type { GatewayMethodContext } from './types.js';
import { getMethodRegistry } from './methodRegistry.js';
import {
  initBuiltinTtsProviders,
  getTtsProvider,
  listTtsProviderIds,
  normalizeProviderId,
  type ITTSProvider,
  type TTSConfig,
  type AudioFormat,
} from '../adapters/tts/index.js';
import { logger } from '../logger.js';

// Registry 类型从 getMethodRegistry 推导
type GatewayMethodRegistry = ReturnType<typeof getMethodRegistry>;

// 模块加载时注册内置 Provider（覆盖式注册，可安全重复调用）
initBuiltinTtsProviders();

// ========== 内存状态 ==========

interface TtsRuntimeState {
  enabled: boolean;
  provider: string | undefined;
  voice: string | undefined;
  language: string | undefined;
  format: AudioFormat | undefined;
}

const ttsState: TtsRuntimeState = {
  enabled: false,
  provider: undefined,
  voice: undefined,
  language: undefined,
  format: undefined,
};

// ========== 辅助函数 ==========

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

// 将 AudioFormat 映射为 MIME 类型
function formatToMimeType(format: string): string {
  switch (format) {
    case 'mp3':
      return 'audio/mpeg';
    case 'opus':
      return 'audio/ogg';
    case 'wav':
      return 'audio/wav';
    case 'pcm':
      return 'audio/pcm';
    case 'aac':
      return 'audio/aac';
    case 'ogg':
      return 'audio/ogg';
    default:
      return 'audio/mpeg';
  }
}

/**
 * 自动选择已配置的 Provider — 按 autoSelectOrder 升序遍历，返回首个
 * isConfigured 的 Provider。未配置任何凭证时返回 null。
 */
async function autoSelectProvider(config: TTSConfig): Promise<ITTSProvider | null> {
  const ids = listTtsProviderIds();
  const candidates = await Promise.all(
    ids.map(async (id) => {
      const provider = await getTtsProvider(id);
      if (!provider) return null;
      try {
        return provider.isConfigured(config) ? provider : null;
      } catch {
        return null;
      }
    }),
  );
  const configured = candidates.filter((p): p is ITTSProvider => p !== null);
  if (configured.length === 0) return null;
  configured.sort((a, b) => a.autoSelectOrder - b.autoSelectOrder);
  return configured[0];
}

/**
 * 解析合成目标 Provider：显式指定（含别名）走 normalizeProviderId；
 * 'auto' 或未指定走 autoSelectProvider。
 */
async function resolveProviderForSynthesis(
  hint: string | undefined,
  config: TTSConfig,
): Promise<ITTSProvider | null> {
  const trimmed = hint?.trim().toLowerCase();
  if (!trimmed || trimmed === 'auto') {
    return autoSelectProvider(config);
  }
  const canonical = normalizeProviderId(trimmed);
  if (!canonical) return null;
  return getTtsProvider(canonical);
}

// ========== RPC 方法实现 ==========

/**
 * tts.status — 获取 TTS 状态
 * 参数：{} (空)
 * 返回：{ enabled, provider, voice, language, format }
 */
async function ttsStatus(_params: unknown, _ctx: GatewayMethodContext) {
  return {
    enabled: ttsState.enabled,
    provider: ttsState.provider ?? null,
    voice: ttsState.voice ?? null,
    language: ttsState.language ?? null,
    format: ttsState.format ?? null,
  };
}

/**
 * tts.providers — 列出可用 TTS 提供者
 * 参数：{} (空)
 * 返回：{ providers: Array<{ id, label, aliases, configured, ... }>, active }
 */
async function ttsProviders(_params: unknown, _ctx: GatewayMethodContext) {
  const ids = listTtsProviderIds();
  const providers = await Promise.all(
    ids.map(async (id) => {
      const provider = await getTtsProvider(id);
      if (!provider) return null;
      let configured = false;
      try {
        configured = provider.isConfigured({});
      } catch {
        configured = false;
      }
      return {
        id: provider.id,
        label: provider.label,
        aliases: provider.aliases ? [...provider.aliases] : [],
        autoSelectOrder: provider.autoSelectOrder,
        languages: [...provider.languages],
        defaultVoice: provider.defaultVoice,
        defaultModel: provider.defaultModel,
        defaultFormat: provider.defaultFormat,
        supportedFormats: [...provider.supportedFormats],
        configured,
      };
    }),
  );
  return {
    providers: providers.filter((p): p is NonNullable<typeof p> => p !== null),
    active: ttsState.provider ?? null,
  };
}

/**
 * tts.personas — 列出可用语音角色（声音）
 * 参数：{ provider?: string }
 * - 指定 provider：返回该 provider 的声音清单
 * - 未指定：聚合所有 provider 的内置预设
 * 返回：{ personas: Array<{ id, name, provider, language, gender, ... }>, active }
 */
async function ttsPersonas(params: unknown, _ctx: GatewayMethodContext) {
  const { provider: providerHint } = (params || {}) as { provider?: string };
  const hint = normalizeOptionalString(providerHint);

  let personas: Array<Record<string, unknown>> = [];
  if (hint && hint !== 'auto') {
    const canonical = normalizeProviderId(hint);
    if (!canonical) {
      return {
        ok: false,
        error: { code: 'INVALID_REQUEST', message: `未知 Provider: ${hint}` },
      };
    }
    const provider = await getTtsProvider(canonical);
    if (!provider) {
      return {
        ok: false,
        error: { code: 'NOT_FOUND', message: `Provider 未注册: ${canonical}` },
      };
    }
    const voices = await provider.listVoices();
    personas = voices.map((v) => ({
      id: v.id,
      name: v.name ?? v.id,
      provider: v.provider ?? provider.id,
      language: v.language,
      locale: v.locale,
      gender: v.gender,
      description: v.description,
      category: v.category,
      sampleRate: v.sampleRate,
    }));
  } else {
    // 聚合所有 Provider 的内置声音
    const ids = listTtsProviderIds();
    const all = await Promise.all(
      ids.map(async (id) => {
        const provider = await getTtsProvider(id);
        if (!provider) return [] as ITTSProvider['voices'];
        try {
          return await provider.listVoices();
        } catch {
          return [...provider.voices];
        }
      }),
    );
    personas = all.flat().map((v) => ({
      id: v.id,
      name: v.name ?? v.id,
      provider: v.provider,
      language: v.language,
      locale: v.locale,
      gender: v.gender,
      description: v.description,
      category: v.category,
      sampleRate: v.sampleRate,
    }));
  }

  return {
    personas,
    active: ttsState.voice ?? null,
  };
}

/**
 * tts.enable — 启用 TTS
 * 参数：{} (空)
 * 返回：{ enabled: true }
 */
async function ttsEnable(_params: unknown, _ctx: GatewayMethodContext) {
  ttsState.enabled = true;
  return { enabled: true };
}

/**
 * tts.disable — 禁用 TTS
 * 参数：{} (空)
 * 返回：{ enabled: false }
 */
async function ttsDisable(_params: unknown, _ctx: GatewayMethodContext) {
  ttsState.enabled = false;
  return { enabled: false };
}

/**
 * tts.convert — 文本转语音转换
 * 参数：{ text, provider?, voice?, language?, format?, speed?, pitch?, volume? }
 * 返回：{ audioBase64, provider, outputFormat, mimeType } 或错误
 */
async function ttsConvert(params: unknown, _ctx: GatewayMethodContext) {
  const p = (params || {}) as {
    text?: string;
    provider?: string;
    voice?: string;
    language?: string;
    format?: string;
    speed?: number;
    pitch?: number;
    volume?: number;
    sampleRate?: number;
    ssml?: boolean;
  };

  const text = normalizeOptionalString(p.text);
  if (!text) {
    return {
      ok: false,
      error: { code: 'INVALID_REQUEST', message: 'tts.convert requires text' },
    };
  }

  // 解析 provider：请求参数优先，其次内存态
  const providerHint = normalizeOptionalString(p.provider) ?? ttsState.provider;
  const voice = normalizeOptionalString(p.voice) ?? ttsState.voice;
  const language = normalizeOptionalString(p.language) ?? ttsState.language;
  const format = (normalizeOptionalString(p.format) ?? ttsState.format) as
    | AudioFormat
    | undefined;

  const config: TTSConfig = {
    voice,
    language,
    format,
    speed: typeof p.speed === 'number' ? p.speed : undefined,
    pitch: typeof p.pitch === 'number' ? p.pitch : undefined,
    volume: typeof p.volume === 'number' ? p.volume : undefined,
    sampleRate: typeof p.sampleRate === 'number' ? p.sampleRate : undefined,
    ['ssml']: typeof p.ssml === 'boolean' ? p.ssml : false,
  };

  const provider = await resolveProviderForSynthesis(providerHint, config);
  if (!provider) {
    return {
      ok: false,
      error: {
        code: 'UNAVAILABLE',
        message:
          providerHint && providerHint !== 'auto'
            ? `未知或未注册的 Provider: ${providerHint}`
            : '未配置任何 TTS Provider 凭证',
      },
    };
  }

  if (!provider.isConfigured(config)) {
    return {
      ok: false,
      error: {
        code: 'UNAVAILABLE',
        message: `Provider "${provider.id}" 未配置凭证`,
      },
    };
  }

  try {
    const result = await provider.synthesize({ text, config });
    const audioBuffer = Buffer.isBuffer(result.audio)
      ? result.audio
      : Buffer.from(result.audio);
    const outFormat = result.format ?? format ?? 'mp3';

    return {
      audioBase64: audioBuffer.toString('base64'),
      provider: provider.id,
      outputFormat: outFormat,
      mimeType: formatToMimeType(outFormat),
      sampleRate: result.sampleRate,
      durationMs: result.durationMs,
    };
  } catch (err) {
    logger.warn(`[tts.convert] synthesis failed: ${(err as Error).message}`);
    return {
      ok: false,
      error: {
        code: 'UNAVAILABLE',
        message: `tts synthesis failed: ${(err as Error).message}`,
      },
    };
  }
}

/**
 * tts.setProvider — 设置 TTS 提供者
 * 参数：{ provider }
 * 返回：{ provider } 或错误（未知 provider）
 */
async function ttsSetProvider(params: unknown, _ctx: GatewayMethodContext) {
  const { provider: rawProvider } = (params || {}) as { provider?: string };
  const provider = normalizeOptionalString(rawProvider);

  if (!provider) {
    return {
      ok: false,
      error: { code: 'INVALID_REQUEST', message: 'provider is required' },
    };
  }

  const canonical = normalizeProviderId(provider);
  if (!canonical) {
    return {
      ok: false,
      error: {
        code: 'INVALID_REQUEST',
        message: `Invalid provider. Use a registered TTS provider id: ${provider}`,
      },
    };
  }

  ttsState.provider = canonical;
  return { provider: canonical };
}

/**
 * tts.setPersona — 设置语音角色（声音）
 * 参数：{ persona }
 * - persona 为 'off' / 'none' / 'default' 时清除当前声音
 * 返回：{ persona } 或 null
 */
async function ttsSetPersona(params: unknown, _ctx: GatewayMethodContext) {
  const { persona: rawPersona } = (params || {}) as { persona?: string };
  const persona = normalizeOptionalString(rawPersona);

  if (!persona || ['off', 'none', 'default'].includes(persona.toLowerCase())) {
    ttsState.voice = undefined;
    return { persona: null };
  }

  ttsState.voice = persona;
  return { persona };
}

// ========== 注册函数 ==========

/**
 * 注册所有 TTS 方法
 */
export function registerTtsMethods(registry: GatewayMethodRegistry): void {
  registry.register('tts.status', ttsStatus);
  registry.register('tts.providers', ttsProviders);
  registry.register('tts.personas', ttsPersonas);
  registry.register('tts.enable', ttsEnable);
  registry.register('tts.disable', ttsDisable);
  registry.register('tts.convert', ttsConvert);
  registry.register('tts.setProvider', ttsSetProvider);
  registry.register('tts.setPersona', ttsSetPersona);
}

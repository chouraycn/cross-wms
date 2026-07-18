/**
 * 声音管理 — 声音列举、选择与预览。
 *
 * 参考 openclaw status-config 中 voice/persona 解析思路，提供跨 Provider 的
 * 声音聚合查询、按语言/性别筛选，以及短文本预览合成。
 */

import type { Gender, ProviderConfig, TTSResult, Voice } from './types.js';
import type { TTSProviderPlugin } from './types.js';
import type { ProviderRegistry } from './provider-registry.js';

/** 列举 Provider 或全部声音。 */
export function listVoices(
  registry: ProviderRegistry,
  providerId?: string,
): Voice[] {
  if (providerId) {
    const provider = registry.get(providerId);
    return provider ? [...provider.voices] : [];
  }
  return registry.list().flatMap((p) => p.voices.map((v) => ({ ...v, provider: p.id })));
}

/** 查找指定声音所属 Provider 与声音元数据。 */
export function findVoice(
  registry: ProviderRegistry,
  voiceId: string,
): { voice: Voice; provider: TTSProviderPlugin } | undefined {
  for (const provider of registry.list()) {
    const voice = provider.voices.find((v) => v.id === voiceId);
    if (voice) return { voice: { ...voice, provider: provider.id }, provider };
  }
  return undefined;
}

/** 在指定 Provider 内按语言/性别选择声音。 */
export function selectVoice(
  registry: ProviderRegistry,
  providerId: string,
  language?: string,
  gender?: Gender,
): Voice | undefined {
  const provider = registry.get(providerId);
  if (!provider) return undefined;

  let candidates = [...provider.voices];
  if (language) {
    const langMatch = candidates.filter((v) => v.language === language || v.locale?.startsWith(language));
    if (langMatch.length > 0) candidates = langMatch;
  }
  if (gender) {
    const genderMatch = candidates.filter((v) => v.gender === gender);
    if (genderMatch.length > 0) candidates = genderMatch;
  }
  return candidates[0];
}

/** 声音管理器，封装注册表操作。 */
export class VoiceManager {
  constructor(private readonly registry: ProviderRegistry) {}

  list(providerId?: string): Voice[] {
    return listVoices(this.registry, providerId);
  }

  find(voiceId: string): { voice: Voice; provider: TTSProviderPlugin } | undefined {
    return findVoice(this.registry, voiceId);
  }

  select(
    providerId: string,
    language?: string,
    gender?: Gender,
  ): Voice | undefined {
    return selectVoice(this.registry, providerId, language, gender);
  }

  /**
   * 预览指定声音：用该声音合成一段固定示例文本。
   * 返回合成结果，便于前端播放。
   */
  async preview(
    voiceId: string,
    providerConfig: ProviderConfig = {},
    fetchFn?: typeof fetch,
  ): Promise<TTSResult> {
    const found = findVoice(this.registry, voiceId);
    if (!found) throw new Error(`未找到声音: ${voiceId}`);

    const { provider, voice } = found;
    const sampleText =
      voice.language === 'en' ? 'Hello, this is a voice preview.' : '你好，这是语音预览。';

    const result = await provider.synthesize({
      text: sampleText,
      config: providerConfig,
      voice: voice.id,
      language: voice.language,
      fetchFn,
    });

    return {
      audio: result.audio,
      format: result.format,
      provider: provider.id,
      voice: voice.id,
      sampleRate: result.sampleRate,
      durationMs: result.durationMs,
      metadata: { ...result.metadata, preview: true },
    };
  }
}

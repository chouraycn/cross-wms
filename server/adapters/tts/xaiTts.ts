/**
 * xAI（Grok）TTS 适配器。
 *
 * 基于 xAI /tts 接口，Bearer 鉴权，返回音频二进制。参考
 * openclaw/extensions/xai/tts.ts。baseUrl 默认 https://api.x.ai/v1。
 */

import type {
  AudioFormat,
  ITTSProvider,
  TTSConfig,
  TTSAudioResult,
  TTSSynthesizeRequest,
  TTSVoice,
  TTSListVoicesRequest,
} from './types.js';
import { postJsonBinary, resolveApiKey } from '../../engine/tts/providers/shared.js';

const ENV_KEY = 'XAI_API_KEY';
const DEFAULT_BASE_URL = 'https://api.x.ai/v1';

const VOICES: readonly TTSVoice[] = [
  { id: 'eve', name: 'Eve', provider: 'xai', language: 'en', gender: 'female' },
  { id: 'ara', name: 'Ara', provider: 'xai', language: 'en', gender: 'female' },
  { id: 'rex', name: 'Rex', provider: 'xai', language: 'en', gender: 'male' },
  { id: 'sal', name: 'Sal', provider: 'xai', language: 'en', gender: 'neutral' },
  { id: 'leo', name: 'Leo', provider: 'xai', language: 'en', gender: 'male' },
  { id: 'una', name: 'Una', provider: 'xai', language: 'en', gender: 'female' },
];

const SUPPORTED_FORMATS: readonly AudioFormat[] = ['mp3', 'wav', 'pcm'];

/** 规范化 xAI language（"auto" 或 BCP-47 子标签）。 */
function normalizeLanguage(value: string | undefined): string {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) return 'en';
  if (trimmed === 'auto' || /^[a-z]{2,3}(?:-[a-z]{2,4})?$/.test(trimmed)) {
    return trimmed;
  }
  return 'en';
}

/** 将 AudioFormat 映射为 xAI output_format.codec。 */
function formatToCodec(format: AudioFormat | undefined): 'mp3' | 'wav' | 'pcm' | 'mulaw' | 'alaw' {
  switch (format) {
    case 'wav':
      return 'wav';
    case 'pcm':
      return 'pcm';
    default:
      return 'mp3';
  }
}

/** 创建 xAI TTS Provider。 */
export function createXaiTtsProvider(): ITTSProvider {
  return {
    id: 'xai',
    label: 'xAI',
    aliases: ['x-ai', 'grok-tts'],
    autoSelectOrder: 60,
    languages: ['en', 'zh', 'ja', 'ko', 'fr', 'de', 'es'],
    voices: VOICES,
    defaultVoice: 'eve',
    defaultModel: 'eve',
    defaultFormat: 'mp3',
    supportedFormats: SUPPORTED_FORMATS,

    isConfigured(config: TTSConfig): boolean {
      return Boolean(resolveApiKey(config, ENV_KEY));
    },

    async synthesize(req: TTSSynthesizeRequest): Promise<TTSAudioResult> {
      const apiKey = resolveApiKey(req.config, ENV_KEY);
      if (!apiKey) throw new Error('xAI TTS 未配置 API Key（XAI_API_KEY）');

      const baseUrl = (req.config.apiEndpoint ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
      const voice = req.config.voice ?? this.defaultVoice;
      const language = normalizeLanguage(req.config.language);
      const codec = formatToCodec(req.config.format);
      const format: AudioFormat = codec === 'wav' ? 'wav' : codec === 'pcm' ? 'pcm' : 'mp3';

      const body: Record<string, unknown> = {
        text: req.text,
        voice_id: voice,
        language,
        output_format: { codec },
      };
      if (req.config.speed !== undefined) body.speed = req.config.speed;
      if (req.config.extraBody) Object.assign(body, req.config.extraBody);

      const res = await postJsonBinary({
        url: `${baseUrl}/tts`,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(req.config.extraHeaders ?? {}),
        },
        body,
        timeoutMs: req.config.timeoutMs,
        fetchFn: req.config.fetchFn,
      });

      // xAI 错误响应为 JSON
      const json = res.json as { error?: { message?: string } } | undefined;
      if (json?.error?.message) {
        throw new Error(`xAI TTS 错误: ${json.error.message}`);
      }

      return {
        audio: res.data,
        format,
        metadata: { provider: 'xai', voice, language, codec },
      };
    },

    async listVoices(_req?: TTSListVoicesRequest): Promise<TTSVoice[]> {
      // xAI 无公开声音列表端点，返回内置预设。
      return [...VOICES];
    },
  };
}

export const xaiTtsFactory = createXaiTtsProvider;

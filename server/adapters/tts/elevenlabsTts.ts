/**
 * ElevenLabs TTS 适配器。
 *
 * 基于 ElevenLabs /v1/text-to-speech/{voiceId} 接口，支持 xi-api-key 鉴权、
 * voice_settings 调参与流式输出。参考 openclaw/extensions/elevenlabs/tts.ts。
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
import { httpRequest, postJsonBinary, resolveApiKey, pickFormat } from '../../engine/tts/providers/shared.js';

const ENV_KEY = 'ELEVENLABS_API_KEY';
const DEFAULT_BASE_URL = 'https://api.elevenlabs.io';
const DEFAULT_MODEL = 'eleven_multilingual_v2';

/** 内置预设声音。 */
const VOICES: readonly TTSVoice[] = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', provider: 'elevenlabs', language: 'en', gender: 'female' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', provider: 'elevenlabs', language: 'en', gender: 'female' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', provider: 'elevenlabs', language: 'en', gender: 'female' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', provider: 'elevenlabs', language: 'en', gender: 'male' },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', provider: 'elevenlabs', language: 'en', gender: 'male' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', provider: 'elevenlabs', language: 'en', gender: 'male' },
  { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam', provider: 'elevenlabs', language: 'en', gender: 'male' },
];

const SUPPORTED_FORMATS: readonly AudioFormat[] = ['mp3', 'pcm', 'wav'];

/** 校验 voiceId 格式（ElevenLabs voice id 为字母数字串）。 */
function isValidVoiceId(voiceId: string): boolean {
  return /^[a-zA-Z0-9]{6,40}$/.test(voiceId);
}

/** 将 AudioFormat 转换为 ElevenLabs output_format 参数。 */
function formatToOutputFormat(format: AudioFormat): string {
  switch (format) {
    case 'mp3':
      return 'mp3_44100_128';
    case 'pcm':
      return 'pcm_44100';
    case 'wav':
      return 'wav';
    default:
      return 'mp3_44100_128';
  }
}

/** 解析 voice_settings（带默认值与范围兜底）。 */
function resolveVoiceSettings(config: TTSConfig): {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
  speed: number;
} {
  const raw = (config['voiceSettings'] as Record<string, unknown>) ?? {};
  return {
    stability: typeof raw.stability === 'number' ? raw.stability : 0.5,
    similarity_boost: typeof raw.similarityBoost === 'number' ? raw.similarityBoost : 0.75,
    style: typeof raw.style === 'number' ? raw.style : 0,
    use_speaker_boost: raw.useSpeakerBoost !== false,
    speed: typeof raw.speed === 'number' ? raw.speed : 1,
  };
}

/** 创建 ElevenLabs TTS Provider。 */
export function createElevenLabsTtsProvider(): ITTSProvider {
  return {
    id: 'elevenlabs',
    label: 'ElevenLabs',
    aliases: ['eleven'],
    autoSelectOrder: 20,
    languages: ['en', 'zh', 'ja', 'ko', 'fr', 'de', 'es'],
    voices: VOICES,
    defaultVoice: '21m00Tcm4TlvDq8ikWAM',
    defaultModel: DEFAULT_MODEL,
    defaultFormat: 'mp3',
    supportedFormats: SUPPORTED_FORMATS,

    isConfigured(config: TTSConfig): boolean {
      return Boolean(resolveApiKey(config, ENV_KEY));
    },

    async synthesize(req: TTSSynthesizeRequest): Promise<TTSAudioResult> {
      const apiKey = resolveApiKey(req.config, ENV_KEY);
      if (!apiKey) throw new Error('ElevenLabs TTS 未配置 API Key（ELEVENLABS_API_KEY）');

      const baseUrl = (req.config.apiEndpoint ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
      const voice = req.config.voice ?? this.defaultVoice;
      if (!isValidVoiceId(voice)) {
        throw new Error(`Invalid ElevenLabs voiceId: ${voice}`);
      }
      const model = req.config.modelId ?? this.defaultModel;
      const format = pickFormat(
        SUPPORTED_FORMATS,
        req.config.format,
        this.defaultFormat,
      ) as AudioFormat;

      const outputFormat = formatToOutputFormat(format);
      const url = `${baseUrl}/v1/text-to-speech/${voice}?output_format=${outputFormat}`;
      const body = {
        text: req.text,
        model_id: model,
        voice_settings: resolveVoiceSettings(req.config),
      };

      const res = await postJsonBinary({
        url,
        headers: {
          'xi-api-key': apiKey,
          Accept: 'audio/mpeg',
          ...(req.config.extraHeaders ?? {}),
        },
        body,
        timeoutMs: req.config.timeoutMs,
        fetchFn: req.config.fetchFn,
      });

      if (!res.ok) {
        const json = res.json as { detail?: { message?: string } | string } | undefined;
        const detail =
          typeof json?.detail === 'string'
            ? json.detail
            : json?.detail?.message ?? res.data.toString('utf8').slice(0, 200);
        throw new Error(`ElevenLabs TTS 错误: ${detail}`);
      }

      return {
        audio: res.data,
        format,
        metadata: { provider: 'elevenlabs', voice, model, outputFormat },
      };
    },

    async listVoices(req?: TTSListVoicesRequest): Promise<TTSVoice[]> {
      const config = req?.config ?? {};
      const apiKey = resolveApiKey(config, ENV_KEY);
      if (!apiKey) return [...VOICES];

      const baseUrl = (config.apiEndpoint ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
      try {
        const resp = await httpRequest({
          url: `${baseUrl}/v1/voices`,
          method: 'GET',
          headers: { 'xi-api-key': apiKey },
          timeoutMs: config.timeoutMs,
          fetchFn: config.fetchFn,
        });
        if (!resp.ok) return [...VOICES];
        const data = resp.json as {
          voices?: Array<{
            voice_id: string;
            name: string;
            labels?: Record<string, string>;
          }>;
        };
        if (!data.voices) return [...VOICES];
        return data.voices.map((v) => ({
          id: v.voice_id,
          name: v.name,
          provider: 'elevenlabs',
          language: 'en',
          gender: (v.labels?.gender as TTSVoice['gender']) ?? 'neutral',
        }));
      } catch {
        return [...VOICES];
      }
    },
  };
}

export const elevenLabsTtsFactory = createElevenLabsTtsProvider;

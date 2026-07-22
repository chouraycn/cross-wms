/**
 * Minimax TTS 适配器。
 *
 * 基于 Minimax /v1/t2a_v2 接口，Bearer 鉴权，响应体 data.audio 为 hex 编码
 * 的音频字节。参考 openclaw/extensions/minimax/tts.ts。
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

const ENV_KEY = 'MINIMAX_API_KEY';
const DEFAULT_BASE_URL = 'https://api.minimax.io';
const DEFAULT_MODEL = 'speech-02-hd';
const DEFAULT_VOICE = 'English_expressive_narrator';

const VOICES: readonly TTSVoice[] = [
  { id: 'English_expressive_narrator', name: 'English Expressive Narrator', provider: 'minimax', language: 'en', gender: 'neutral' },
  { id: 'Chinese (Mandarin)_Warm_Girl', name: '温柔女声 (zh)', provider: 'minimax', language: 'zh', gender: 'female' },
  { id: 'Chinese (Mandarin)_Lively_Girl', name: '活泼女声 (zh)', provider: 'minimax', language: 'zh', gender: 'female' },
  { id: 'Chinese (Mandarin)_Gentle_Boy', name: '温和男声 (zh)', provider: 'minimax', language: 'zh', gender: 'male' },
  { id: 'Chinese (Mandarin)_Steady_Boy', name: '沉稳男声 (zh)', provider: 'minimax', language: 'zh', gender: 'male' },
];

const SUPPORTED_FORMATS: readonly AudioFormat[] = ['mp3', 'wav', 'pcm'];

/** 创建 Minimax TTS Provider。 */
export function createMinimaxTtsProvider(): ITTSProvider {
  return {
    id: 'minimax',
    label: 'MiniMax',
    aliases: ['minimax-tts'],
    autoSelectOrder: 40,
    languages: ['zh', 'en', 'ja', 'ko'],
    voices: VOICES,
    defaultVoice: DEFAULT_VOICE,
    defaultModel: DEFAULT_MODEL,
    defaultFormat: 'mp3',
    supportedFormats: SUPPORTED_FORMATS,

    isConfigured(config: TTSConfig): boolean {
      return Boolean(resolveApiKey(config, ENV_KEY));
    },

    async synthesize(req: TTSSynthesizeRequest): Promise<TTSAudioResult> {
      const apiKey = resolveApiKey(req.config, ENV_KEY);
      if (!apiKey) throw new Error('Minimax TTS 未配置 API Key（MINIMAX_API_KEY）');

      const baseUrl = (req.config.apiEndpoint ?? DEFAULT_BASE_URL)
        .replace(/\/+$/, '')
        .replace(/\/(?:anthropic|v1)$/i, '');
      const model = req.config.modelId ?? this.defaultModel;
      const voiceId = req.config.voice ?? this.defaultVoice;
      const format = req.config.format ?? this.defaultFormat;
      const sampleRate = req.config.sampleRate ?? 32_000;

      const body = {
        model,
        text: req.text,
        stream: false,
        output_format: 'hex',
        voice_setting: {
          voice_id: voiceId,
          speed: req.config.speed ?? 1,
          vol: req.config.volume !== undefined ? req.config.volume / 50 : 1,
          pitch: req.config.pitch !== undefined ? Math.trunc(req.config.pitch) : 0,
        },
        audio_setting: {
          format,
          sample_rate: sampleRate,
        },
      };

      const res = await postJsonBinary({
        url: `${baseUrl}/v1/t2a_v2`,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(req.config.extraHeaders ?? {}),
        },
        body,
        timeoutMs: req.config.timeoutMs,
        fetchFn: req.config.fetchFn,
      });

      const payload = res.json as {
        data?: { audio?: string };
        base_resp?: { status_code?: number; status_msg?: string };
      } | undefined;

      // HTTP 200 仍可能携带非零 status_code（配额/计费错误）。
      if (
        payload?.base_resp &&
        typeof payload.base_resp.status_code === 'number' &&
        payload.base_resp.status_code !== 0
      ) {
        const msg = payload.base_resp.status_msg ?? 'unknown error';
        throw new Error(`Minimax TTS 错误 (${payload.base_resp.status_code}): ${msg}`);
      }

      const hexAudio = payload?.data?.audio;
      if (!hexAudio) {
        throw new Error('Minimax TTS 未返回音频数据');
      }

      return {
        audio: Buffer.from(hexAudio, 'hex'),
        format,
        sampleRate,
        metadata: { provider: 'minimax', voice: voiceId, model },
      };
    },

    async listVoices(_req?: TTSListVoicesRequest): Promise<TTSVoice[]> {
      // Minimax 无公开声音列表端点，返回内置预设。
      return [...VOICES];
    },
  };
}

export const minimaxTtsFactory = createMinimaxTtsProvider;

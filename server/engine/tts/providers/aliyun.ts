/**
 * 阿里云语音 TTS Provider（国内优先）。
 *
 * 基于阿里云智能语音交互 NLS 的 HTTP 合成接口建模：
 * 通过 AppKey + AccessToken 调用 /api/v1/tts 合成音频。
 * 实际生产环境通常使用 WebSocket 长连接，此处使用 REST 形态便于集成与测试。
 */

import type {
  AudioFormat,
  ProviderConfig,
  SynthesizeRequest,
  SynthesizeResult,
  TTSProviderPlugin,
  Voice,
} from '../types.js';
import { postJsonBinary, resolveApiKey, pickFormat } from './shared.js';

const ENV_KEY = 'ALIYUN_TTS_API_KEY';
const DEFAULT_BASE_URL = 'https://nls-meta.cn-shanghai.aliyuncs.com';

const VOICES: readonly Voice[] = [
  { id: 'xiaoyun', name: '小云', provider: 'aliyun', language: 'zh', gender: 'female', description: '标准女声' },
  { id: 'xiaogang', name: '小刚', provider: 'aliyun', language: 'zh', gender: 'male', description: '标准男声' },
  { id: 'ruoxi', name: '若汐', provider: 'aliyun', language: 'zh', gender: 'female', description: '温柔女声' },
  { id: 'siyue', name: '思悦', provider: 'aliyun', language: 'zh', gender: 'female', description: '亲切女声' },
  { id: 'aina', name: '爱娜', provider: 'aliyun', language: 'zh', gender: 'female', description: '浙普女声' },
];

const SUPPORTED_FORMATS: readonly AudioFormat[] = ['mp3', 'wav', 'pcm'];

/** 读取阿里云 NLS AccessToken（独立于 AppKey 的访问令牌）。 */
function readToken(config: ProviderConfig): string {
  return typeof config.token === 'string' ? config.token : '';
}

/** 构造阿里云 TTS 请求体。 */
export function buildAliyunRequest(
  text: string,
  config: ProviderConfig,
  voice: string,
  format: string,
  sampleRate: number,
  speed?: number,
  pitch?: number,
  volume?: number,
): Record<string, unknown> {
  return {
    appkey: config.apiKey,
    text,
    voice,
    format,
    sample_rate: sampleRate,
    volume: volume ?? 50,
    speech_rate: speed ? Math.round((speed - 1) * 100) : 0,
    pitch_rate: pitch ? Math.round(pitch * 50) : 0,
    ...(readToken(config) ? { token: readToken(config) } : {}),
  };
}

/** 创建阿里云 TTS Provider 插件。 */
export function createAliyunProvider(): TTSProviderPlugin {
  return {
    id: 'aliyun',
    label: '阿里云语音',
    aliases: ['alibaba', 'nls'],
    autoSelectOrder: 1,
    languages: ['zh', 'en'],
    voices: VOICES,
    defaultVoice: 'xiaoyun',
    defaultModel: 'nls-tts',
    supportedFormats: SUPPORTED_FORMATS,
    defaultFormat: 'mp3',
    isConfigured(config: ProviderConfig): boolean {
      return Boolean(resolveApiKey(config, ENV_KEY));
    },
    async synthesize(req: SynthesizeRequest): Promise<SynthesizeResult> {
      const apiKey = resolveApiKey(req.config, ENV_KEY);
      if (!apiKey) throw new Error('阿里云 TTS 未配置 API Key（ALIYUN_TTS_API_KEY）');

      const baseUrl = (req.config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
      const voice = req.voice ?? req.config.voice ?? this.defaultVoice;
      const format = pickFormat(
        SUPPORTED_FORMATS,
        req.format ?? req.config.format,
        this.defaultFormat,
      ) as AudioFormat;
      const sampleRate = req.sampleRate ?? req.config.sampleRate ?? 16000;

      const body = buildAliyunRequest(
        req.text,
        { ...req.config, apiKey },
        voice,
        format,
        sampleRate,
        req.speed,
        req.pitch,
        req.volume,
      );

      const res = await postJsonBinary({
        url: `${baseUrl}/api/v1/tts`,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'X-NLS-Token': readToken(req.config),
        },
        body,
        timeoutMs: req.timeoutMs,
        fetchFn: req.fetchFn,
      });

      // 兼容返回 JSON 错误体的场景
      if (res.json && typeof res.json === 'object' && 'err_msg' in (res.json as Record<string, unknown>)) {
        const err = res.json as { err_msg?: string; code?: string };
        throw new Error(`阿里云 TTS 错误: ${err.err_msg ?? err.code ?? 'unknown'}`);
      }

      return {
        audio: res.data,
        format,
        sampleRate,
        metadata: { provider: 'aliyun', voice },
      };
    },
    async listVoices(): Promise<Voice[]> {
      return [...VOICES];
    },
  };
}

/**
 * 讯飞语音 TTS Provider（国内优先）。
 *
 * 基于讯飞开放平台在线语音合成（WebSocket 鉴权模式）建模。鉴权采用
 * iAT 风格的 hmac-sha1 签名并 base64。签名实现独立导出，便于单元测试。
 * 此处以 REST 形态调用，便于集成与测试。
 */

import { createHmac } from 'node:crypto';
import type {
  AudioFormat,
  ProviderConfig,
  SynthesizeRequest,
  SynthesizeResult,
  TTSProviderPlugin,
  Voice,
} from '../types.js';
import { postJsonBinary, pickFormat } from './shared.js';

const ENV_KEY = 'XFYUN_TTS_API_KEY';
const ENV_SECRET_KEY = 'XFYUN_TTS_API_SECRET';
const ENV_APP_ID = 'XFYUN_TTS_APP_ID';
const DEFAULT_HOST = 'tts-api.xfyun.cn';
const DEFAULT_PATH = '/v2/tts';

const VOICES: readonly Voice[] = [
  { id: 'xiaoyan', name: '小燕', provider: 'xfyun', language: 'zh', gender: 'female', description: '普通话女声' },
  { id: 'aisxping', name: '小萍', provider: 'xfyun', language: 'zh', gender: 'female', description: '方言女声' },
  { id: 'aisjiuxu', name: '许久', provider: 'xfyun', language: 'zh', gender: 'male', description: '沉稳男声' },
  { id: 'aisbabyxu', name: '许小宝', provider: 'xfyun', language: 'zh', gender: 'neutral', description: '童声' },
  { id: 'xiaoyan', name: '小燕', provider: 'xfyun', language: 'zh', gender: 'female' },
];

const SUPPORTED_FORMATS: readonly AudioFormat[] = ['mp3', 'wav', 'pcm'];

/** hmac-sha1 → base64。 */
function hmacSha1Base64(secret: string, data: string): string {
  return createHmac('sha1', secret).update(data, 'utf8').digest('base64');
}

/** 讯飞鉴权输入。 */
export interface XfyunAuthParams {
  apiKey: string;
  apiSecret: string;
  host: string;
  path: string;
  date: string; // RFC1123 格式日期
}

/** 讯飞鉴权输出。 */
export interface XfyunAuth {
  authorization: string; // base64
  date: string;
  host: string;
}

/**
 * 计算讯飞 iAT 鉴权签名。
 * signature_origin = "host: <host>\ndate: <date>\nGET <path> HTTP/1.1"
 * signature = base64(hmac-sha1(apiSecret, signature_origin))
 * authorization = base64('api_key="<apiKey>", algorithm="hmac-sha1", headers="host date request-line", signature="<signature>"')
 */
export function buildXfyunAuth(params: XfyunAuthParams): XfyunAuth {
  const signatureOrigin = `host: ${params.host}\ndate: ${params.date}\nGET ${params.path} HTTP/1.1`;
  const signature = hmacSha1Base64(params.apiSecret, signatureOrigin);
  const authorizationOrigin =
    `api_key="${params.apiKey}", algorithm="hmac-sha1", ` +
    `headers="host date request-line", signature="${signature}"`;
  // 讯飞要求对 authorization_origin 做 base64
  const authorization = Buffer.from(authorizationOrigin, 'utf8').toString('base64');
  return { authorization, date: params.date, host: params.host };
}

/** 构造讯飞 TTS 请求体。 */
export function buildXfyunRequest(
  text: string,
  appId: string,
  voice: string,
  format: string,
  sampleRate: number,
  speed?: number,
  volume?: number,
): Record<string, unknown> {
  // 讯飞要求 base64 文本
  const textBase64 = Buffer.from(text, 'utf8').toString('base64');
  return {
    common: { app_id: appId },
    business: {
      aue: format === 'wav' ? 'wav' : format === 'pcm' ? 'raw' : 'lame',
      vcn: voice,
      speed: speed ? Math.round(speed * 10) : 50,
      volume: volume ?? 50,
      pitch: 50,
      sfl: 1,
      tte: 'UTF8',
      sampleRate,
    },
    data: {
      status: 2,
      text: textBase64,
    },
  };
}

/** 创建讯飞 TTS Provider 插件。 */
export function createXfyunProvider(): TTSProviderPlugin {
  return {
    id: 'xfyun',
    label: '讯飞语音',
    aliases: ['iflytek', 'xunfei'],
    autoSelectOrder: 3,
    languages: ['zh', 'en'],
    voices: VOICES,
    defaultVoice: 'xiaoyan',
    defaultModel: 'online-tts',
    supportedFormats: SUPPORTED_FORMATS,
    defaultFormat: 'mp3',
    isConfigured(config: ProviderConfig): boolean {
      const hasKey =
        Boolean(config.apiKey?.trim() || process.env[ENV_KEY]) &&
        Boolean(config.secretKey?.trim() || process.env[ENV_SECRET_KEY]);
      const hasApp = Boolean(config.appId?.trim() || process.env[ENV_APP_ID]);
      return hasKey && hasApp;
    },
    async synthesize(req: SynthesizeRequest): Promise<SynthesizeResult> {
      const apiKey = req.config.apiKey?.trim() || (process.env[ENV_KEY] ? String(process.env[ENV_KEY]).trim() : undefined);
      const apiSecret = req.config.secretKey?.trim() || (process.env[ENV_SECRET_KEY] ? String(process.env[ENV_SECRET_KEY]).trim() : undefined);
      const appId = req.config.appId?.trim() || (process.env[ENV_APP_ID] ? String(process.env[ENV_APP_ID]).trim() : undefined);
      if (!apiKey || !apiSecret || !appId) {
        throw new Error('讯飞 TTS 未配置 apiKey/apiSecret/appId');
      }

      const host = (req.config.baseUrl ?? DEFAULT_HOST).replace(/^https?:\/\//, '').replace(/\/+$/, '');
      const path = DEFAULT_PATH;
      const date = new Date().toUTCString();
      const auth = buildXfyunAuth({ apiKey, apiSecret, host, path, date });

      const voice = req.voice ?? req.config.voice ?? this.defaultVoice;
      const format = pickFormat(
        SUPPORTED_FORMATS,
        req.format ?? req.config.format,
        this.defaultFormat,
      ) as AudioFormat;
      const sampleRate = req.sampleRate ?? req.config.sampleRate ?? 16000;

      const body = buildXfyunRequest(req.text, appId, voice, format, sampleRate, req.speed, req.volume);

      const query = `authorization=${encodeURIComponent(auth.authorization)}&date=${encodeURIComponent(date)}&host=${encodeURIComponent(host)}`;
      const res = await postJsonBinary({
        url: `https://${host}${path}?${query}`,
        headers: {
          'Content-Type': 'application/json',
          Host: host,
        },
        body,
        timeoutMs: req.timeoutMs,
        fetchFn: req.fetchFn,
      });

      const json = res.json as { code?: number; message?: string; data?: { audio?: string } } | undefined;
      if (json?.code && json.code !== 0) {
        throw new Error(`讯飞 TTS 错误: ${json.message ?? json.code}`);
      }
      // 讯飞常返回 base64 音频
      if (json?.data?.audio) {
        return {
          audio: Buffer.from(json.data.audio, 'base64'),
          format,
          sampleRate,
          metadata: { provider: 'xfyun', voice },
        };
      }

      return {
        audio: res.data,
        format,
        sampleRate,
        metadata: { provider: 'xfyun', voice },
      };
    },
    async listVoices(): Promise<Voice[]> {
      return [...VOICES];
    },
  };
}

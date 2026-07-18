/**
 * 腾讯云语音 TTS Provider（国内优先）。
 *
 * 基于腾讯云语音合成 TextToVoice 接口建模，使用 TC3-HMAC-SHA256 签名。
 * 签名实现独立导出，便于单元测试其确定性。
 */

import { createHash, createHmac } from 'node:crypto';
import type {
  AudioFormat,
  ProviderConfig,
  SynthesizeRequest,
  SynthesizeResult,
  TTSProviderPlugin,
  Voice,
} from '../types.js';
import { postJsonBinary, resolveApiKey, pickFormat } from './shared.js';

const ENV_KEY = 'TENCENT_TTS_SECRET_ID';
const ENV_SECRET_KEY = 'TENCENT_TTS_SECRET_KEY';
const DEFAULT_HOST = 'tts.tencentcloudapi.com';
const DEFAULT_REGION = 'ap-beijing';

const VOICES: readonly Voice[] = [
  { id: '101001', name: '智瑜', provider: 'tencent', language: 'zh', gender: 'female', description: '情感女声' },
  { id: '101002', name: '智聆', provider: 'tencent', language: 'zh', gender: 'female', description: '通用女声' },
  { id: '101003', name: '智美', provider: 'tencent', language: 'zh', gender: 'female', description: '客服女声' },
  { id: '101004', name: '智云', provider: 'tencent', language: 'zh', gender: 'male', description: '通用男声' },
  { id: '101005', name: '智莉', provider: 'tencent', language: 'zh', gender: 'female', description: '通用女声' },
];

const SUPPORTED_FORMATS: readonly AudioFormat[] = ['mp3', 'wav', 'pcm'];

const TENCENT_SERVICE = 'tts';

/** 将 Unix 时间戳转为 UTC YYYY-MM-DD。 */
export function timestampToDate(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

function sha256Hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

/** 签名输入参数。 */
export interface TencentSignParams {
  secretId: string;
  secretKey: string;
  host: string;
  payload: string;
  timestamp: number; // 秒
  region?: string;
  service?: string;
}

/** 签名输出。 */
export interface TencentSignature {
  authorization: string;
  credentialScope: string;
  date: string;
}

/**
 * 计算 TC3-HMAC-SHA256 签名。
 * 完整实现腾讯云 API v3 签名流程，确定性可测。
 */
export function buildTencentSignature(params: TencentSignParams): TencentSignature {
  const service = params.service ?? TENCENT_SERVICE;
  const date = timestampToDate(params.timestamp);
  const credentialScope = `${date}/${service}/tc3_request`;

  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${params.host}\n`;
  const signedHeaders = 'content-type;host';
  const hashedPayload = sha256Hex(params.payload);
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${hashedPayload}`;

  const stringToSign = `TC3-HMAC-SHA256\n${params.timestamp}\n${credentialScope}\n${sha256Hex(canonicalRequest)}`;

  const secretDate = hmacSha256256('TC3' + params.secretKey, date);
  const secretService = hmacSha256256(secretDate, service);
  const secretSigning = hmacSha256256(secretService, 'tc3_request');
  const signature = createHmac('sha256', secretSigning).update(stringToSign, 'utf8').digest('hex');

  const authorization =
    `TC3-HMAC-SHA256 Credential=${params.secretId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { authorization, credentialScope, date };
}

// 内部包装：统一 Buffer/string 键
function hmacSha256256(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

/** 构造腾讯云 TTS 请求体（TextToVoice）。 */
export function buildTencentRequest(
  text: string,
  voice: string,
  format: string,
  sampleRate: number,
  speed?: number,
  volume?: number,
): Record<string, unknown> {
  return {
    Text: text,
    SessionId: 'tts-runtime',
    ModelType: 1,
    Volume: volume ?? 0,
    Speed: speed ?? 0,
    VoiceType: Number(voice) || 101001,
    SampleRate: sampleRate,
    Codec: format,
    PrimaryLanguage: 1,
  };
}

/** 创建腾讯云 TTS Provider 插件。 */
export function createTencentProvider(): TTSProviderPlugin {
  return {
    id: 'tencent',
    label: '腾讯云语音',
    aliases: ['tc', 'tencent-cloud'],
    autoSelectOrder: 2,
    languages: ['zh', 'en'],
    voices: VOICES,
    defaultVoice: '101001',
    defaultModel: 'TextToVoice',
    supportedFormats: SUPPORTED_FORMATS,
    defaultFormat: 'mp3',
    isConfigured(config: ProviderConfig): boolean {
      return Boolean(resolveApiKey(config, ENV_KEY)) && Boolean(config.secretKey?.trim() || process.env[ENV_SECRET_KEY]);
    },
    async synthesize(req: SynthesizeRequest): Promise<SynthesizeResult> {
      const secretId = resolveApiKey(req.config, ENV_KEY);
      const secretKey = req.config.secretKey?.trim() || (process.env[ENV_SECRET_KEY] ? String(process.env[ENV_SECRET_KEY]).trim() : undefined);
      if (!secretId || !secretKey) {
        throw new Error('腾讯云 TTS 未配置 SecretId/SecretKey');
      }

      const host = (req.config.baseUrl ?? DEFAULT_HOST).replace(/^https?:\/\//, '').replace(/\/+$/, '');
      const region = req.config.region ?? DEFAULT_REGION;
      const voice = req.voice ?? req.config.voice ?? this.defaultVoice;
      const format = pickFormat(
        SUPPORTED_FORMATS,
        req.format ?? req.config.format,
        this.defaultFormat,
      ) as AudioFormat;
      const sampleRate = req.sampleRate ?? req.config.sampleRate ?? 16000;

      const body = buildTencentRequest(req.text, voice, format, sampleRate, req.speed, req.volume);
      const payload = JSON.stringify(body);
      const timestamp = Math.floor(Date.now() / 1000);
      const { authorization } = buildTencentSignature({
        secretId,
        secretKey,
        host,
        payload,
        timestamp,
        region,
      });

      const res = await postJsonBinary({
        url: `https://${host}/`,
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/json; charset=utf-8',
          Host: host,
          'X-TC-Action': 'TextToVoice',
          'X-TC-Timestamp': String(timestamp),
          'X-TC-Version': '2019-08-23',
          'X-TC-Region': region,
        },
        body: payload,
        timeoutMs: req.timeoutMs,
        fetchFn: req.fetchFn,
      });

      // 腾讯云错误响应为 JSON
      const json = res.json as { Response?: { Error?: { Message?: string } } } | undefined;
      if (json?.Response?.Error?.Message) {
        throw new Error(`腾讯云 TTS 错误: ${json.Response.Error.Message}`);
      }

      return {
        audio: res.data,
        format,
        sampleRate,
        metadata: { provider: 'tencent', voice },
      };
    },
    async listVoices(): Promise<Voice[]> {
      return [...VOICES];
    },
  };
}

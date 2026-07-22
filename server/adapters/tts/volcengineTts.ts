/**
 * Volcengine（火山引擎 / BytePlus）TTS 适配器。
 *
 * 支持两条路径：
 *  1. BytePlus Seed Speech（apiKey 鉴权，X-Api-* 头，响应为 base64 JSON 帧）
 *  2. 火山引擎 legacy TTS（appId + token 鉴权，Authorization: Bearer;{token}，
 *     响应 code=3000 时 data 为 base64）
 * 参考 openclaw/extensions/volcengine/tts.ts。
 */

import * as crypto from 'node:crypto';
import type {
  AudioFormat,
  ITTSProvider,
  TTSConfig,
  TTSAudioResult,
  TTSSynthesizeRequest,
  TTSVoice,
  TTSListVoicesRequest,
} from './types.js';
import { httpRequest, resolveApiKey } from '../../engine/tts/providers/shared.js';

const ENV_KEY = 'VOLCENGINE_TTS_API_KEY';
const ENV_APP_ID = 'VOLCENGINE_TTS_APP_ID';
const ENV_TOKEN = 'VOLCENGINE_TTS_TOKEN';

const DEFAULT_SEED_VOICE = 'en_female_anna_mars_bigtts';
const DEFAULT_LEGACY_VOICE = 'zh_female_xiaohe_uranus_bigtts';
const DEFAULT_CLUSTER = 'volcano_tts';
const DEFAULT_SEED_RESOURCE_ID = 'seed-tts-1.0';
const DEFAULT_SEED_APP_KEY = 'aGjiRDfUWi';
const BYTEPLUS_SEED_TTS_URL =
  'https://voice.ap-southeast-1.bytepluses.com/api/v3/tts/unidirectional';
const VOLCENGINE_LEGACY_TTS_URL = 'https://openspeech.bytedance.com/api/v1/tts';

const SUPPORTED_FORMATS: readonly AudioFormat[] = ['mp3', 'ogg', 'pcm', 'wav'];

const VOICES: readonly TTSVoice[] = [
  { id: 'zh_female_xiaohe_uranus_bigtts', name: '小何 (zh)', provider: 'volcengine', language: 'zh', gender: 'female' },
  { id: 'zh_male_changshu_bigtts', name: '常书 (zh)', provider: 'volcengine', language: 'zh', gender: 'male' },
  { id: 'en_female_anna_mars_bigtts', name: 'Anna (en)', provider: 'volcengine', language: 'en', gender: 'female' },
  { id: 'en_male_adam_bigtts', name: 'Adam (en)', provider: 'volcengine', language: 'en', gender: 'male' },
];

type VolcengineResponse = {
  code?: number;
  message?: string;
  data?: string;
};

function parseJsonObject(text: string): Record<string, unknown> {
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('expected JSON object');
  }
  return parsed as Record<string, unknown>;
}

function toTtsResponse(parsed: Record<string, unknown>): VolcengineResponse {
  const header =
    parsed.header && typeof parsed.header === 'object' && !Array.isArray(parsed.header)
      ? (parsed.header as Record<string, unknown>)
      : undefined;
  return {
    code:
      typeof parsed.code === 'number'
        ? parsed.code
        : typeof header?.code === 'number'
          ? header.code
          : undefined,
    message:
      typeof parsed.message === 'string'
        ? parsed.message
        : typeof header?.message === 'string'
          ? header.message
          : undefined,
    data: typeof parsed.data === 'string' ? parsed.data : undefined,
  };
}

/** 解析 Seed Speech 流式 JSON 帧（每行一个 JSON 对象，可能带 `data:` 前缀）。 */
function parseSeedFrames(text: string): VolcengineResponse[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  try {
    return [toTtsResponse(parseJsonObject(trimmed))];
  } catch {
    // 多帧流式响应：逐行解析
  }
  const frames: VolcengineResponse[] = [];
  for (const line of trimmed.split(/\r?\n/)) {
    const item = line.trim();
    if (!item) continue;
    const json = item.startsWith('data:') ? item.slice('data:'.length).trim() : item;
    try {
      frames.push(toTtsResponse(parseJsonObject(json)));
    } catch {
      // 跳过无法解析的帧
    }
  }
  return frames;
}

/** Seed Speech 路径（apiKey 鉴权）。 */
async function seedSpeechTts(
  req: TTSSynthesizeRequest,
  apiKey: string,
): Promise<TTSAudioResult> {
  const config = req.config;
  const voice = config.voice ?? DEFAULT_SEED_VOICE;
  const resourceId = config.resourceId ?? DEFAULT_SEED_RESOURCE_ID;
  const appKey = config.appKey ?? DEFAULT_SEED_APP_KEY;
  const baseUrl = (config.apiEndpoint ?? BYTEPLUS_SEED_TTS_URL).replace(/\/+$/, '');
  const speedRatio = config.speed ?? 1;
  const emotion = config['emotion'] as string | undefined;
  const encoding = (config.format === 'mp3'
    ? 'mp3'
    : config.format === 'pcm'
      ? 'pcm'
      : 'ogg_opus') as 'mp3' | 'pcm' | 'ogg_opus';
  const audioFormat: AudioFormat = encoding === 'ogg_opus' ? 'ogg' : (encoding as AudioFormat);

  const payload = {
    user: { uid: 'cross-wms' },
    req_params: {
      text: req.text,
      speaker: voice,
      audio_params: { format: encoding, sample_rate: 24_000 },
      ...(speedRatio !== 1 ? { speed_ratio: speedRatio } : {}),
      ...(emotion ? { emotion } : {}),
    },
  };

  const res = await httpRequest({
    url: baseUrl,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Connection: 'keep-alive',
      'X-Api-Key': apiKey,
      'X-Api-Resource-Id': resourceId,
      'X-Api-App-Key': appKey,
      ...(config.extraHeaders ?? {}),
    },
    body: payload,
    timeoutMs: config.timeoutMs,
    fetchFn: config.fetchFn,
  });

  const frames = parseSeedFrames(res.data.toString('utf8'));
  const chunks: Buffer[] = [];
  for (const frame of frames) {
    if (frame.code === 0) {
      if (frame.data) chunks.push(Buffer.from(frame.data, 'base64'));
      continue;
    }
    if (frame.code === 20000000) continue;
    throw new Error(
      `BytePlus Seed Speech TTS 错误 ${frame.code ?? res.status}: ${frame.message ?? 'unknown'}`,
    );
  }

  if (!res.ok || chunks.length === 0) {
    throw new Error(`BytePlus Seed Speech TTS 错误 ${res.status}: 无音频数据`);
  }

  return {
    audio: Buffer.concat(chunks),
    format: audioFormat,
    metadata: { provider: 'volcengine', voice, mode: 'seed' },
  };
}

/** Legacy 火山引擎 TTS 路径（appId + token 鉴权）。 */
async function legacyVolcengineTts(
  req: TTSSynthesizeRequest,
  appId: string,
  token: string,
): Promise<TTSAudioResult> {
  const config = req.config;
  const voice = config.voice ?? DEFAULT_LEGACY_VOICE;
  const cluster = config['cluster'] as string | undefined ?? DEFAULT_CLUSTER;
  const baseUrl = (config.apiEndpoint ?? VOLCENGINE_LEGACY_TTS_URL).replace(/\/+$/, '');
  const speedRatio = config.speed ?? 1;
  const volumeRatio = config.volume !== undefined ? config.volume / 50 : 1;
  const pitchRatio = config.pitch !== undefined ? 1 + config.pitch / 6 : 1;
  const emotion = config['emotion'] as string | undefined;
  const encoding = (config.format === 'mp3'
    ? 'mp3'
    : config.format === 'pcm'
      ? 'pcm'
      : config.format === 'wav'
        ? 'wav'
        : 'ogg_opus') as 'mp3' | 'pcm' | 'wav' | 'ogg_opus';
  const audioFormat: AudioFormat = encoding === 'ogg_opus' ? 'ogg' : (encoding as AudioFormat);

  const payload = {
    app: { appid: appId, token, cluster },
    user: { uid: 'cross-wms' },
    audio: {
      voice_type: voice,
      encoding,
      speed_ratio: speedRatio,
      volume_ratio: volumeRatio,
      pitch_ratio: pitchRatio,
      ...(emotion ? { emotion } : {}),
    },
    request: {
      reqid: crypto.randomUUID(),
      text: req.text,
      text_type: 'plain',
      operation: 'query',
    },
  };

  const res = await httpRequest({
    url: baseUrl,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer;${token}`,
      ...(config.extraHeaders ?? {}),
    },
    body: payload,
    timeoutMs: config.timeoutMs,
    fetchFn: config.fetchFn,
  });

  const body = toTtsResponse(parseJsonObject(res.data.toString('utf8')));
  if (!res.ok || body.code !== 3000 || !body.data) {
    throw new Error(
      `Volcengine TTS 错误 ${body.code ?? res.status}: ${body.message ?? 'unknown'}`,
    );
  }

  return {
    audio: Buffer.from(body.data, 'base64'),
    format: audioFormat,
    metadata: { provider: 'volcengine', voice, mode: 'legacy' },
  };
}

/** 创建 Volcengine TTS Provider。 */
export function createVolcengineTtsProvider(): ITTSProvider {
  return {
    id: 'volcengine',
    label: 'Volcengine',
    aliases: ['byteplus', 'doubao-tts', '火山引擎'],
    autoSelectOrder: 50,
    languages: ['zh', 'en', 'ja', 'ko'],
    voices: VOICES,
    defaultVoice: DEFAULT_LEGACY_VOICE,
    defaultModel: DEFAULT_LEGACY_VOICE,
    defaultFormat: 'ogg',
    supportedFormats: SUPPORTED_FORMATS,

    isConfigured(config: TTSConfig): boolean {
      return (
        Boolean(resolveApiKey(config, ENV_KEY)) ||
        Boolean(
          (config.appId ?? process.env[ENV_APP_ID]) &&
            (config.token ?? process.env[ENV_TOKEN]),
        )
      );
    },

    async synthesize(req: TTSSynthesizeRequest): Promise<TTSAudioResult> {
      const apiKey = resolveApiKey(req.config, ENV_KEY);
      if (apiKey) {
        return seedSpeechTts(req, apiKey);
      }

      const appId = (req.config.appId ?? process.env[ENV_APP_ID]?.trim()) as string | undefined;
      const token = (req.config.token ?? process.env[ENV_TOKEN]?.trim()) as string | undefined;
      if (appId && token) {
        return legacyVolcengineTts(req, appId, token);
      }

      throw new Error(
        'Volcengine TTS 凭证缺失：请设置 VOLCENGINE_TTS_API_KEY（Seed Speech）或 VOLCENGINE_TTS_APP_ID + VOLCENGINE_TTS_TOKEN（legacy）',
      );
    },

    async listVoices(_req?: TTSListVoicesRequest): Promise<TTSVoice[]> {
      return [...VOICES];
    },
  };
}

export const volcengineTtsFactory = createVolcengineTtsProvider;

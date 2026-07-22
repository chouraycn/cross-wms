/**
 * Azure Speech TTS 适配器。
 *
 * 基于 Azure 认知服务语音 REST API：通过 SSML 合成、Ocp-Apim-Subscription-Key
 * 鉴权、X-Microsoft-OutputFormat 指定输出格式。baseUrl 由 region 推导：
 *   https://{region}.tts.speech.microsoft.com
 * 参考 openclaw/extensions/azure-speech/tts.ts。
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
import { httpRequest, resolveApiKey } from '../../engine/tts/providers/shared.js';

const ENV_KEY = 'AZURE_SPEECH_KEY';
const ENV_REGION = 'AZURE_SPEECH_REGION';
const DEFAULT_VOICE = 'en-US-JennyNeural';
const DEFAULT_LANG = 'en-US';
const DEFAULT_AUDIO_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';
const SUPPORTED_FORMATS: readonly AudioFormat[] = ['mp3', 'wav', 'pcm', 'ogg'];

/** Azure 输出格式到 AudioFormat 的映射（用于回填 TTSAudioResult.format）。 */
const FORMAT_MAP: Array<{ match: RegExp; format: AudioFormat }> = [
  { match: /mp3/i, format: 'mp3' },
  { match: /^ogg-/i, format: 'ogg' },
  { match: /^webm-/i, format: 'ogg' },
  { match: /^riff-/i, format: 'wav' },
  { match: /^raw-/i, format: 'pcm' },
];

function inferFormat(outputFormat: string): AudioFormat {
  const normalized = outputFormat.toLowerCase();
  for (const entry of FORMAT_MAP) {
    if (entry.match.test(normalized)) return entry.format;
  }
  return 'mp3';
}

/** 解析 Azure Speech base URL：优先 apiEndpoint，其次 region，最后环境变量。 */
function resolveBaseUrl(config: TTSConfig): string {
  const configured = config.apiEndpoint?.trim() ?? (config['endpoint'] as string | undefined)?.trim();
  if (configured) {
    return configured.replace(/\/+$/, '').replace(/\/cognitiveservices\/v1$/i, '');
  }
  const region = config.region?.trim() ?? process.env[ENV_REGION]?.trim();
  if (region) {
    return `https://${region}.tts.speech.microsoft.com`;
  }
  throw new Error('Azure Speech region 或 endpoint 缺失（设置 region 或 apiEndpoint）');
}

function escapeXmlText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeXmlAttr(value: string): string {
  return escapeXmlText(value).replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** 构造 Azure Speech SSML。 */
export function buildAzureSsml(params: {
  text: string;
  voice: string;
  lang?: string;
  rate?: string;
  pitch?: string;
}): string {
  const lang = params.lang?.trim() || DEFAULT_LANG;
  const voice = params.voice;
  const rateAttr = params.rate ? ` rate="${escapeXmlAttr(params.rate)}"` : '';
  const pitchAttr = params.pitch ? ` pitch="${escapeXmlAttr(params.pitch)}"` : '';
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" ` +
    `xml:lang="${escapeXmlAttr(lang)}">` +
    `<voice name="${escapeXmlAttr(voice)}">` +
    `<prosody${rateAttr}${pitchAttr}>${escapeXmlText(params.text)}</prosody>` +
    `</voice></speak>`
  );
}

/** 创建 Azure Speech TTS Provider。 */
export function createAzureTtsProvider(): ITTSProvider {
  return {
    id: 'azure-speech',
    label: 'Azure Speech',
    aliases: ['azure', 'azure-tts'],
    autoSelectOrder: 30,
    languages: ['en', 'zh', 'ja', 'ko', 'fr', 'de', 'es'],
    voices: [
      { id: 'en-US-JennyNeural', name: 'Jenny (en-US)', provider: 'azure-speech', language: 'en', locale: 'en-US', gender: 'female' },
      { id: 'en-US-GuyNeural', name: 'Guy (en-US)', provider: 'azure-speech', language: 'en', locale: 'en-US', gender: 'male' },
      { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓 (zh-CN)', provider: 'azure-speech', language: 'zh', locale: 'zh-CN', gender: 'female' },
      { id: 'zh-CN-YunxiNeural', name: '云希 (zh-CN)', provider: 'azure-speech', language: 'zh', locale: 'zh-CN', gender: 'male' },
    ],
    defaultVoice: DEFAULT_VOICE,
    defaultModel: DEFAULT_VOICE,
    defaultFormat: 'mp3',
    supportedFormats: SUPPORTED_FORMATS,

    isConfigured(config: TTSConfig): boolean {
      return Boolean(resolveApiKey(config, ENV_KEY));
    },

    async synthesize(req: TTSSynthesizeRequest): Promise<TTSAudioResult> {
      const apiKey = resolveApiKey(req.config, ENV_KEY);
      if (!apiKey) throw new Error('Azure Speech 未配置 API Key（AZURE_SPEECH_KEY）');

      const baseUrl = resolveBaseUrl(req.config);
      const voice = req.config.voice ?? this.defaultVoice;
      const lang = req.config.language ?? DEFAULT_LANG;
      const outputFormat =
        (req.config['outputFormat'] as string | undefined)?.trim() || DEFAULT_AUDIO_FORMAT;
      const url = `${baseUrl}/cognitiveservices/v1`;

      // speed/pitch 转为 Azure prosody 百分比表达
      const rate =
        req.config.speed !== undefined
          ? `${Math.round(req.config.speed * 100)}%`
          : undefined;
      const pitch =
        req.config.pitch !== undefined
          ? `${req.config.pitch > 0 ? '+' : ''}${req.config.pitch}st`
          : undefined;

      const ssml = buildAzureSsml({ text: req.text, voice, lang, rate, pitch });

      const res = await httpRequest({
        url,
        method: 'POST',
        headers: {
          'Content-Type': 'application/ssml+xml',
          'Ocp-Apim-Subscription-Key': apiKey,
          'X-Microsoft-OutputFormat': outputFormat,
          'User-Agent': 'Cross-WMS',
          ...(req.config.extraHeaders ?? {}),
        },
        body: ssml,
        timeoutMs: req.config.timeoutMs,
        fetchFn: req.config.fetchFn,
      });

      if (!res.ok) {
        const detail = res.data.toString('utf8').slice(0, 200);
        throw new Error(`Azure Speech TTS 错误 (${res.status}): ${detail}`);
      }

      return {
        audio: res.data,
        format: inferFormat(outputFormat),
        metadata: { provider: 'azure-speech', voice, lang, outputFormat },
      };
    },

    async listVoices(req?: TTSListVoicesRequest): Promise<TTSVoice[]> {
      const config = req?.config ?? {};
      const apiKey = resolveApiKey(config, ENV_KEY);
      if (!apiKey) return [...this.voices];

      const baseUrl = resolveBaseUrl(config);
      try {
        const res = await httpRequest({
          url: `${baseUrl}/cognitiveservices/voices/list`,
          method: 'GET',
          headers: {
            'Ocp-Apim-Subscription-Key': apiKey,
            ...(config.extraHeaders ?? {}),
          },
          timeoutMs: config.timeoutMs,
          fetchFn: config.fetchFn,
        });
        if (!res.ok) return [...this.voices];
        const voices = res.json as Array<{
          ShortName?: string;
          DisplayName?: string;
          Locale?: string;
          Gender?: string;
          VoiceTag?: { VoicePersonalities?: string[] };
          Status?: string;
        }>;
        if (!Array.isArray(voices)) return [...this.voices];
        return voices
          .filter((v) => v.ShortName)
          .map((v) => ({
            id: v.ShortName!,
            name: v.DisplayName,
            provider: 'azure-speech',
            locale: v.Locale,
            language: v.Locale?.split('-')[0]?.toLowerCase(),
            gender: (v.Gender?.toLowerCase() as TTSVoice['gender']) ?? 'neutral',
            personalities: v.VoiceTag?.VoicePersonalities,
          }));
      } catch {
        return [...this.voices];
      }
    },
  };
}

export const azureTtsFactory = createAzureTtsProvider;

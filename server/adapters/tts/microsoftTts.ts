/**
 * Microsoft Edge TTS 适配器。
 *
 * 基于微软 Edge 浏览器“大声朗读”所用的免费神经语音服务（无需 API Key）。
 * 实际协议为 WebSocket SSML：连接 speech.platform.bing.com，发送 config 与
 * ssml 文本帧，收集二进制音频帧直到 turn.end。参考 openclaw/extensions/microsoft/tts.ts
 * 的 node-edge-tts 用法，此处直接实现 WebSocket 协议以避免引入额外依赖。
 *
 * Node 22+ 提供全局 WebSocket；该适配器在 Node 22.19+ 运行时下可用。
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
import { httpRequest } from '../../engine/tts/providers/shared.js';

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const WSS_URL = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1`;
const VOICES_LIST_URL = `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list`;
const DEFAULT_OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';
const DEFAULT_VOICE = 'zh-CN-XiaoxiaoNeural';
const DEFAULT_LANG = 'zh-CN';

const SUPPORTED_FORMATS: readonly AudioFormat[] = ['mp3', 'wav', 'pcm', 'ogg'];

const VOICES: readonly TTSVoice[] = [
  { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓 (zh-CN)', provider: 'microsoft', language: 'zh', locale: 'zh-CN', gender: 'female' },
  { id: 'zh-CN-YunxiNeural', name: '云希 (zh-CN)', provider: 'microsoft', language: 'zh', locale: 'zh-CN', gender: 'male' },
  { id: 'zh-CN-YunyangNeural', name: '云扬 (zh-CN)', provider: 'microsoft', language: 'zh', locale: 'zh-CN', gender: 'male' },
  { id: 'en-US-JennyNeural', name: 'Jenny (en-US)', provider: 'microsoft', language: 'en', locale: 'en-US', gender: 'female' },
  { id: 'en-US-GuyNeural', name: 'Guy (en-US)', provider: 'microsoft', language: 'en', locale: 'en-US', gender: 'male' },
  { id: 'ja-JP-NanamiNeural', name: '七海 (ja-JP)', provider: 'microsoft', language: 'ja', locale: 'ja-JP', gender: 'female' },
];

function escapeXmlText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeXmlAttr(value: string): string {
  return escapeXmlText(value).replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** 生成无连字符的 UUID（Edge TTS ConnectionId 要求）。 */
function connectionId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

/** 推导输出格式对应的 AudioFormat。 */
function inferFormat(outputFormat: string): AudioFormat {
  const n = outputFormat.toLowerCase();
  if (n.includes('mp3')) return 'mp3';
  if (n.startsWith('ogg-') || n.startsWith('webm-')) return 'ogg';
  if (n.startsWith('riff-')) return 'wav';
  if (n.startsWith('raw-')) return 'pcm';
  return 'mp3';
}

/** 构造 Edge TTS SSML。 */
export function buildEdgeSsml(params: {
  text: string;
  voice: string;
  lang?: string;
  rate?: string;
  pitch?: string;
  volume?: string;
}): string {
  const lang = params.lang?.trim() || DEFAULT_LANG;
  const rateAttr = params.rate ? ` rate="${escapeXmlAttr(params.rate)}"` : '';
  const pitchAttr = params.pitch ? ` pitch="${escapeXmlAttr(params.pitch)}"` : '';
  const volAttr = params.volume ? ` volume="${escapeXmlAttr(params.volume)}"` : '';
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" ` +
    `xml:lang="${escapeXmlAttr(lang)}">` +
    `<voice name="${escapeXmlAttr(params.voice)}">` +
    `<prosody${rateAttr}${pitchAttr}${volAttr}>${escapeXmlText(params.text)}</prosody>` +
    `</voice></speak>`
  );
}

interface EdgeTtsWebSocketLike {
  binaryType: string;
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(
    type: 'open' | 'message' | 'error' | 'close',
    listener: (ev: { data?: unknown; code?: number; reason?: string }) => void,
  ): void;
  removeEventListener(
    type: 'open' | 'message' | 'error' | 'close',
    listener: (ev: { data?: unknown; code?: number; reason?: string }) => void,
  ): void;
}

/**
 * 通过 Edge TTS WebSocket 协议合成语音。
 *
 * 协议：连接后发送 speech.config 文本帧与 ssml 文本帧；服务端以二进制帧
 * 推送音频（前 2 字节为头长度），以文本帧 Path:turn.end 结束。
 */
async function synthesizeViaWebSocket(params: {
  text: string;
  voice: string;
  lang: string;
  outputFormat: string;
  rate?: string;
  pitch?: string;
  volume?: string;
  timeoutMs?: number;
}): Promise<Buffer> {
  const wsCtor = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
  if (!wsCtor) {
    throw new Error('Microsoft Edge TTS 需要全局 WebSocket（Node 22+）');
  }

  const url = `${WSS_URL}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&ConnectionId=${connectionId()}`;
  const ws = new wsCtor(url) as EdgeTtsWebSocketLike;
  ws.binaryType = 'arraybuffer';

  const timeoutMs = params.timeoutMs ?? 30_000;
  const audioChunks: Buffer[] = [];
  let turnEnded = false;

  return new Promise<Buffer>((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        // 忽略关闭错误
      }
      reject(new Error(`Microsoft Edge TTS 超时（${timeoutMs}ms）`));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
    };

    const onOpen = () => {
      const ts = new Date().toISOString();
      // 1) 配置帧
      const configMsg =
        `X-Timestamp:${ts}\r\n` +
        `Content-Type:application/json; charset=utf-8\r\n` +
        `Path:speech.config\r\n\r\n` +
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: { sentenceBoundaryEnabled: false, wordBoundaryEnabled: false },
                outputFormat: params.outputFormat,
              },
            },
          },
        });
      ws.send(configMsg);

      // 2) SSML 帧
      const ssml = buildEdgeSsml({
        text: params.text,
        voice: params.voice,
        lang: params.lang,
        rate: params.rate,
        pitch: params.pitch,
        volume: params.volume,
      });
      const ssmlMsg =
        `X-Id:1\r\n` +
        `Content-Type:application/ssml+xml\r\n` +
        `X-Timestamp:${ts}\r\n` +
        `Path:ssml\r\n\r\n${ssml}`;
      ws.send(ssmlMsg);
    };

    const onMessage = (ev: { data?: unknown }) => {
      const data = ev.data;
      if (typeof data === 'string') {
        // 文本帧：turn.end 表示合成完成
        if (data.includes('Path:turn.end')) {
          turnEnded = true;
          cleanup();
          try {
            ws.close();
          } catch {
            // 忽略
          }
          if (audioChunks.length === 0) {
            reject(new Error('Microsoft Edge TTS 未返回音频数据'));
          } else {
            resolve(Buffer.concat(audioChunks));
          }
        }
        return;
      }

      if (data instanceof ArrayBuffer) {
        const buf = Buffer.from(data);
        // 二进制帧：前 2 字节（大端）为头长度，其后为头文本，再后为音频字节
        if (buf.length < 2) return;
        const headerLen = buf.readUInt16BE(0);
        const audioStart = 2 + headerLen;
        if (audioStart < buf.length) {
          audioChunks.push(buf.subarray(audioStart));
        }
      }
    };

    const onError = (ev: { data?: unknown }) => {
      cleanup();
      const detail = ev.data instanceof Error ? ev.data.message : 'WebSocket 错误';
      reject(new Error(`Microsoft Edge TTS 错误: ${detail}`));
    };

    const onClose = (ev: { code?: number; reason?: string }) => {
      cleanup();
      if (!turnEnded) {
        const reason = ev.reason || `code ${ev.code}`;
        reject(new Error(`Microsoft Edge TTS 连接关闭未完成: ${reason}`));
      }
    };

    ws.addEventListener('open', onOpen);
    ws.addEventListener('message', onMessage);
    ws.addEventListener('error', onError);
    ws.addEventListener('close', onClose);
  });
}

/** 创建 Microsoft Edge TTS Provider。 */
export function createMicrosoftTtsProvider(): ITTSProvider {
  return {
    id: 'microsoft',
    label: 'Microsoft Edge TTS',
    aliases: ['edge', 'edge-tts', 'azure-edge'],
    autoSelectOrder: 25,
    languages: ['zh', 'en', 'ja', 'ko', 'fr', 'de', 'es'],
    voices: VOICES,
    defaultVoice: DEFAULT_VOICE,
    defaultModel: DEFAULT_VOICE,
    defaultFormat: 'mp3',
    supportedFormats: SUPPORTED_FORMATS,

    isConfigured(_config: TTSConfig): boolean {
      // Edge TTS 免密钥，始终可用
      return true;
    },

    async synthesize(req: TTSSynthesizeRequest): Promise<TTSAudioResult> {
      const voice = req.config.voice ?? this.defaultVoice;
      const localeRaw = req.config.locale;
      const lang =
        req.config.language ??
        (typeof localeRaw === 'string' && localeRaw.trim() ? localeRaw : undefined) ??
        DEFAULT_LANG;
      const outputFormat =
        (req.config['outputFormat'] as string | undefined)?.trim() || DEFAULT_OUTPUT_FORMAT;

      // speed/pitch/volume 转为 Edge prosody 百分比表达
      const rate =
        req.config.speed !== undefined
          ? `${Math.round((req.config.speed - 1) * 100)}%`
          : undefined;
      const pitch =
        req.config.pitch !== undefined
          ? `${Math.round(req.config.pitch * 50)}%`
          : undefined;
      const volume =
        req.config.volume !== undefined
          ? `${Math.round((req.config.volume - 50) * 2)}%`
          : undefined;

      const audio = await synthesizeViaWebSocket({
        text: req.text,
        voice,
        lang,
        outputFormat,
        rate,
        pitch,
        volume,
        timeoutMs: req.config.timeoutMs,
      });

      return {
        audio,
        format: inferFormat(outputFormat),
        metadata: { provider: 'microsoft', voice, lang, outputFormat },
      };
    },

    async listVoices(req?: TTSListVoicesRequest): Promise<TTSVoice[]> {
      const config = req?.config ?? {};
      try {
        const res = await httpRequest({
          url: `${VOICES_LIST_URL}?trustedclienttoken=${TRUSTED_CLIENT_TOKEN}`,
          method: 'GET',
          timeoutMs: config.timeoutMs,
          fetchFn: config.fetchFn,
        });
        if (!res.ok) return [...VOICES];
        const voices = res.json as Array<{
          ShortName?: string;
          FriendlyName?: string;
          Locale?: string;
          Gender?: string;
          VoiceTag?: { ContentCategories?: string[]; VoicePersonalities?: string[] };
        }>;
        if (!Array.isArray(voices)) return [...VOICES];
        return voices
          .filter((v) => v.ShortName)
          .map((v) => ({
            id: v.ShortName!,
            name: v.FriendlyName,
            provider: 'microsoft',
            locale: v.Locale,
            language: v.Locale?.split('-')[0]?.toLowerCase(),
            gender: (v.Gender?.toLowerCase() as TTSVoice['gender']) ?? 'neutral',
            personalities: v.VoiceTag?.VoicePersonalities,
          }));
      } catch {
        return [...VOICES];
      }
    },
  };
}

export const microsoftTtsFactory = createMicrosoftTtsProvider;

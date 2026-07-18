/**
 * Edge TTS Provider（免费）。
 *
 * 基于微软 Edge 浏览器“大声朗读”所用的语音服务建模。无需 API Key，
 * 提供丰富的神经网络声音（zh-CN-XiaoxiaoNeural 等），适合无密钥场景。
 * 实际协议为 WebSocket SSML；此处以 REST 形态调用便于集成与测试。
 */

import type {
  AudioFormat,
  ProviderConfig,
  SynthesizeRequest,
  SynthesizeResult,
  TTSProviderPlugin,
  Voice,
} from '../types.js';
import { postJsonBinary, pickFormat } from './shared.js';

const DEFAULT_BASE_URL = 'https://speech.platform.bing.com';

const VOICES: readonly Voice[] = [
  { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓', provider: 'edge', language: 'zh', locale: 'zh-CN', gender: 'female' },
  { id: 'zh-CN-YunxiNeural', name: '云希', provider: 'edge', language: 'zh', locale: 'zh-CN', gender: 'male' },
  { id: 'zh-CN-YunyangNeural', name: '云扬', provider: 'edge', language: 'zh', locale: 'zh-CN', gender: 'male' },
  { id: 'en-US-JennyNeural', name: 'Jenny', provider: 'edge', language: 'en', locale: 'en-US', gender: 'female' },
  { id: 'en-US-GuyNeural', name: 'Guy', provider: 'edge', language: 'en', locale: 'en-US', gender: 'male' },
  { id: 'ja-JP-NanamiNeural', name: '七海', provider: 'edge', language: 'ja', locale: 'ja-JP', gender: 'female' },
];

const SUPPORTED_FORMATS: readonly AudioFormat[] = ['mp3', 'wav', 'pcm'];

/** 构造 Edge TTS SSML 请求体。 */
export function buildEdgeRequest(
  text: string,
  voice: string,
  format: string,
  rate?: number,
  pitch?: number,
  volume?: number,
): Record<string, unknown> {
  const ratePct = rate ? `${Math.round((rate - 1) * 100)}%` : '+0%';
  const pitchPct = pitch ? `${Math.round(pitch * 50)}%` : '+0%';
  const volPct = volume ? `${Math.round((volume - 50) * 2)}%` : '+0%';
  const ssml = `<speak version="1.0"><voice name="${voice}"><prosody rate="${ratePct}" pitch="${pitchPct}" volume="${volPct}">${escapeXml(text)}</prosody></voice></speak>`;
  return {
    ssml,
    outputFormat: format === 'wav' ? 'audio-16khz-32kbitrate-mono-mp3' : `audio-16khz-128kbitrate-mono-${format}`,
  };
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 创建 Edge TTS Provider 插件。 */
export function createEdgeProvider(): TTSProviderPlugin {
  return {
    id: 'edge',
    label: 'Edge TTS',
    aliases: ['microsoft', 'azure-edge'],
    autoSelectOrder: 20,
    languages: ['zh', 'en', 'ja'],
    voices: VOICES,
    defaultVoice: 'zh-CN-XiaoxiaoNeural',
    defaultModel: 'edge-tts',
    supportedFormats: SUPPORTED_FORMATS,
    defaultFormat: 'mp3',
    isConfigured(_config: ProviderConfig): boolean {
      // Edge TTS 免密钥，始终可用
      return true;
    },
    async synthesize(req: SynthesizeRequest): Promise<SynthesizeResult> {
      const baseUrl = (req.config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
      const voice = req.voice ?? req.config.voice ?? this.defaultVoice;
      const format = pickFormat(
        SUPPORTED_FORMATS,
        req.format ?? req.config.format,
        this.defaultFormat,
      ) as AudioFormat;

      const body = buildEdgeRequest(req.text, voice, format, req.speed, req.pitch, req.volume);

      const res = await postJsonBinary({
        url: `${baseUrl}/consumer/speech/synthesize/readaloud/edge/v1`,
        headers: {
          'Content-Type': 'application/json',
        },
        body,
        timeoutMs: req.timeoutMs,
        fetchFn: req.fetchFn,
      });

      return {
        audio: res.data,
        format,
        metadata: { provider: 'edge', voice },
      };
    },
    async listVoices(): Promise<Voice[]> {
      return [...VOICES];
    },
  };
}

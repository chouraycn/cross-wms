/**
 * OpenAI TTS Provider。
 *
 * 基于标准 OpenAI /audio/speech 接口，亦兼容任何 OpenAI 风格的端点
 * （如 Azure OpenAI、第三方网关）。通过 Bearer Token 鉴权。
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

const ENV_KEY = 'OPENAI_API_KEY';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

const VOICES: readonly Voice[] = [
  { id: 'alloy', name: 'Alloy', provider: 'openai', language: 'en', gender: 'neutral' },
  { id: 'echo', name: 'Echo', provider: 'openai', language: 'en', gender: 'male' },
  { id: 'fable', name: 'Fable', provider: 'openai', language: 'en', gender: 'neutral' },
  { id: 'onyx', name: 'Onyx', provider: 'openai', language: 'en', gender: 'male' },
  { id: 'nova', name: 'Nova', provider: 'openai', language: 'en', gender: 'female' },
  { id: 'shimmer', name: 'Shimmer', provider: 'openai', language: 'en', gender: 'female' },
];

const SUPPORTED_FORMATS: readonly AudioFormat[] = ['mp3', 'opus', 'aac', 'wav', 'pcm'];

/** 构造 OpenAI /audio/speech 请求体。 */
export function buildOpenAiRequest(
  text: string,
  model: string,
  voice: string,
  format: string,
  speed?: number,
): Record<string, unknown> {
  return {
    model,
    input: text,
    voice,
    response_format: format,
    ...(speed ? { speed } : {}),
  };
}

/** 创建 OpenAI TTS Provider 插件。 */
export function createOpenAiProvider(): TTSProviderPlugin {
  return {
    id: 'openai',
    label: 'OpenAI',
    aliases: ['azure-openai'],
    autoSelectOrder: 10,
    languages: ['en', 'zh'],
    voices: VOICES,
    defaultVoice: 'alloy',
    defaultModel: 'tts-1',
    supportedFormats: SUPPORTED_FORMATS,
    defaultFormat: 'mp3',
    isConfigured(config: ProviderConfig): boolean {
      return Boolean(resolveApiKey(config, ENV_KEY));
    },
    async synthesize(req: SynthesizeRequest): Promise<SynthesizeResult> {
      const apiKey = resolveApiKey(req.config, ENV_KEY);
      if (!apiKey) throw new Error('OpenAI TTS 未配置 API Key（OPENAI_API_KEY）');

      const baseUrl = (req.config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
      const voice = req.voice ?? req.config.voice ?? this.defaultVoice;
      const model = req.config.model ?? this.defaultModel;
      const format = pickFormat(
        SUPPORTED_FORMATS,
        req.format ?? req.config.format,
        this.defaultFormat,
      ) as AudioFormat;

      const body = buildOpenAiRequest(req.text, model, voice, format, req.speed);

      const res = await postJsonBinary({
        url: `${baseUrl}/audio/speech`,
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body,
        timeoutMs: req.timeoutMs,
        fetchFn: req.fetchFn,
      });

      // OpenAI 错误响应为 JSON
      const json = res.json as { error?: { message?: string } } | undefined;
      if (json?.error?.message) {
        throw new Error(`OpenAI TTS 错误: ${json.error.message}`);
      }

      return {
        audio: res.data,
        format,
        metadata: { provider: 'openai', voice, model },
      };
    },
    async listVoices(): Promise<Voice[]> {
      return [...VOICES];
    },
  };
}

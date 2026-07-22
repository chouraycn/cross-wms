/**
 * OpenAI TTS 适配器。
 *
 * 基于标准 OpenAI /audio/speech 接口，亦兼容任何 OpenAI 风格的端点
 * （如 Azure OpenAI、第三方网关）。通过 Bearer Token 鉴权，返回音频二进制。
 * 参考 openclaw/extensions/openai/tts.ts。
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
import { postJsonBinary, resolveApiKey, pickFormat } from '../../engine/tts/providers/shared.js';

const ENV_KEY = 'OPENAI_API_KEY';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'tts-1';

const VOICES: readonly TTSVoice[] = [
  { id: 'alloy', name: 'Alloy', provider: 'openai', language: 'en', gender: 'neutral' },
  { id: 'ash', name: 'Ash', provider: 'openai', language: 'en', gender: 'male' },
  { id: 'ballad', name: 'Ballad', provider: 'openai', language: 'en', gender: 'male' },
  { id: 'cedar', name: 'Cedar', provider: 'openai', language: 'en', gender: 'neutral' },
  { id: 'coral', name: 'Coral', provider: 'openai', language: 'en', gender: 'female' },
  { id: 'echo', name: 'Echo', provider: 'openai', language: 'en', gender: 'male' },
  { id: 'fable', name: 'Fable', provider: 'openai', language: 'en', gender: 'neutral' },
  { id: 'nova', name: 'Nova', provider: 'openai', language: 'en', gender: 'female' },
  { id: 'onyx', name: 'Onyx', provider: 'openai', language: 'en', gender: 'male' },
  { id: 'sage', name: 'Sage', provider: 'openai', language: 'en', gender: 'female' },
  { id: 'shimmer', name: 'Shimmer', provider: 'openai', language: 'en', gender: 'female' },
  { id: 'verse', name: 'Verse', provider: 'openai', language: 'en', gender: 'neutral' },
];

const SUPPORTED_FORMATS: readonly AudioFormat[] = ['mp3', 'opus', 'aac', 'wav', 'pcm'];

/** 构造 OpenAI /audio/speech 请求体。 */
export function buildOpenAiTtsRequest(
  text: string,
  model: string,
  voice: string,
  format: string,
  speed?: number,
  instructions?: string,
  extraBody?: Record<string, unknown>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    input: text,
    voice,
    response_format: format,
  };
  if (speed !== undefined) body.speed = speed;
  // instructions 仅 gpt-4o-mini-tts 等模型支持；自定义端点透传。
  if (instructions && instructions.trim()) body.instructions = instructions;
  if (extraBody) Object.assign(body, extraBody);
  return body;
}

/** 创建 OpenAI TTS Provider。 */
export function createOpenAiTtsProvider(): ITTSProvider {
  return {
    id: 'openai',
    label: 'OpenAI',
    aliases: ['azure-openai', 'openai-tts'],
    autoSelectOrder: 10,
    languages: ['en', 'zh'],
    voices: VOICES,
    defaultVoice: 'alloy',
    defaultModel: DEFAULT_MODEL,
    defaultFormat: 'mp3',
    supportedFormats: SUPPORTED_FORMATS,

    isConfigured(config: TTSConfig): boolean {
      return Boolean(resolveApiKey(config, ENV_KEY));
    },

    async synthesize(req: TTSSynthesizeRequest): Promise<TTSAudioResult> {
      const apiKey = resolveApiKey(req.config, ENV_KEY);
      if (!apiKey) throw new Error('OpenAI TTS 未配置 API Key（OPENAI_API_KEY）');

      const baseUrl = (req.config.apiEndpoint ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
      const voice = req.config.voice ?? this.defaultVoice;
      const model = req.config.modelId ?? this.defaultModel;
      const format = pickFormat(
        SUPPORTED_FORMATS,
        req.config.format,
        this.defaultFormat,
      ) as AudioFormat;
      const instructions = req.config.language
        ? undefined
        : (req.config['instructions'] as string | undefined);

      const body = buildOpenAiTtsRequest(
        req.text,
        model,
        voice,
        format,
        req.config.speed,
        instructions,
        req.config.extraBody,
      );

      const res = await postJsonBinary({
        url: `${baseUrl}/audio/speech`,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(req.config.extraHeaders ?? {}),
        },
        body,
        timeoutMs: req.config.timeoutMs,
        fetchFn: req.config.fetchFn,
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

    async listVoices(_req?: TTSListVoicesRequest): Promise<TTSVoice[]> {
      // OpenAI 无公开声音列表端点，返回内置预设。
      return [...VOICES];
    },
  };
}

export const openAiTtsFactory = createOpenAiTtsProvider;

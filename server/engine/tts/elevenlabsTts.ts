/**
 * ElevenLabs TTS Provider。
 *
 * 基于 ElevenLabs text-to-speech API，支持 API key 认证、
 * 多种声音模型和流式音频输出。
 *
 * 参考 openclaw/extensions/elevenlabs/tts.ts 的实现逻辑，
 * 适配为 server/engine/tts 的 TTSProviderPlugin 接口。
 */

import type {
  AudioFormat,
  ProviderConfig,
  SynthesizeRequest,
  SynthesizeResult,
  TTSProviderPlugin,
  Voice,
  ListVoicesRequest,
} from "./types.js";
import { postJsonBinary, resolveApiKey, pickFormat } from "./providers/shared.js";

const ENV_KEY = "ELEVENLABS_API_KEY";
const DEFAULT_BASE_URL = "https://api.elevenlabs.io";

/** ElevenLabs 输出格式到 AudioFormat 的映射。 */
const OUTPUT_FORMAT_MAP: Record<string, AudioFormat> = {
  mp3_44100_128: "mp3",
  mp3_44100_64: "mp3",
  mp3_22050_32: "mp3",
  pcm_44100: "pcm",
  pcm_24000: "pcm",
  wav: "wav",
};

/** 内置预设声音。 */
const VOICES: readonly Voice[] = [
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", provider: "elevenlabs", language: "en", gender: "female" },
  { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi", provider: "elevenlabs", language: "en", gender: "female" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella", provider: "elevenlabs", language: "en", gender: "female" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni", provider: "elevenlabs", language: "en", gender: "male" },
  { id: "VR6AewLTigWG4xSOukaG", name: "Arnold", provider: "elevenlabs", language: "en", gender: "male" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", provider: "elevenlabs", language: "en", gender: "male" },
  { id: "yoZ06aMxZJJ28mfd3POQ", name: "Sam", provider: "elevenlabs", language: "en", gender: "male" },
];

const SUPPORTED_FORMATS: readonly AudioFormat[] = ["mp3", "pcm", "wav"];

/** 校验 voiceId 格式。 */
function isValidVoiceId(voiceId: string): boolean {
  return /^[a-zA-Z0-9]{10,40}$/.test(voiceId);
}

/** 将 AudioFormat 转换为 ElevenLabs output_format 参数。 */
function formatToOutputFormat(format: AudioFormat): string {
  switch (format) {
    case "mp3":
      return "mp3_44100_128";
    case "pcm":
      return "pcm_44100";
    case "wav":
      return "wav";
    default:
      return "mp3_44100_128";
  }
}

/** 构造 ElevenLabs TTS 请求体。 */
export function buildElevenLabsRequest(
  text: string,
  modelId: string,
  voiceSettings: {
    stability: number;
    similarityBoost: number;
    style: number;
    useSpeakerBoost: boolean;
    speed: number;
  },
): Record<string, unknown> {
  return {
    text,
    model_id: modelId,
    voice_settings: {
      stability: voiceSettings.stability,
      similarity_boost: voiceSettings.similarityBoost,
      style: voiceSettings.style,
      use_speaker_boost: voiceSettings.useSpeakerBoost,
      speed: voiceSettings.speed,
    },
  };
}

/** 创建 ElevenLabs TTS Provider 插件。 */
export function createElevenLabsProvider(): TTSProviderPlugin {
  return {
    id: "elevenlabs",
    label: "ElevenLabs",
    aliases: ["eleven"],
    autoSelectOrder: 20,
    languages: ["en", "zh", "ja", "ko", "fr", "de", "es"],
    voices: VOICES,
    defaultVoice: "21m00Tcm4TlvDq8ikWAM",
    defaultModel: "eleven_multilingual_v2",
    supportedFormats: SUPPORTED_FORMATS,
    defaultFormat: "mp3",
    isConfigured(config: ProviderConfig): boolean {
      return Boolean(resolveApiKey(config, ENV_KEY));
    },
    async synthesize(req: SynthesizeRequest): Promise<SynthesizeResult> {
      const apiKey = resolveApiKey(req.config, ENV_KEY);
      if (!apiKey) throw new Error("ElevenLabs TTS 未配置 API Key（ELEVENLABS_API_KEY）");

      const baseUrl = (req.config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
      const voice = req.voice ?? req.config.voice ?? this.defaultVoice;
      if (!isValidVoiceId(voice)) {
        throw new Error(`Invalid ElevenLabs voiceId: ${voice}`);
      }
      const model = req.config.model ?? this.defaultModel;
      const format = pickFormat(
        SUPPORTED_FORMATS,
        req.format ?? req.config.format,
        this.defaultFormat,
      ) as AudioFormat;

      const voiceSettingsRaw = (req.config.voiceSettings as Record<string, unknown>) ?? {};
      const voiceSettings = {
        stability: typeof voiceSettingsRaw.stability === "number" ? voiceSettingsRaw.stability : 0.5,
        similarityBoost:
          typeof voiceSettingsRaw.similarityBoost === "number"
            ? voiceSettingsRaw.similarityBoost
            : 0.75,
        style: typeof voiceSettingsRaw.style === "number" ? voiceSettingsRaw.style : 0,
        useSpeakerBoost: voiceSettingsRaw.useSpeakerBoost !== false,
        speed: typeof voiceSettingsRaw.speed === "number" ? voiceSettingsRaw.speed : 1,
      };

      const outputFormat = formatToOutputFormat(format);
      const url = `${baseUrl}/v1/text-to-speech/${voice}?output_format=${outputFormat}`;
      const body = buildElevenLabsRequest(req.text, model, voiceSettings);

      const res = await postJsonBinary({
        url,
        headers: {
          "xi-api-key": apiKey,
          Accept: "audio/mpeg",
        },
        body,
        timeoutMs: req.timeoutMs,
        fetchFn: req.fetchFn,
      });

      if (!res.ok) {
        const json = res.json as { detail?: { message?: string } | string } | undefined;
        const detail =
          typeof json?.detail === "string"
            ? json.detail
            : json?.detail?.message ?? res.data.toString("utf8").slice(0, 200);
        throw new Error(`ElevenLabs TTS 错误: ${detail}`);
      }

      return {
        audio: res.data,
        format,
        metadata: {
          provider: "elevenlabs",
          voice,
          model,
          outputFormat,
        },
      };
    },
    async listVoices(req?: ListVoicesRequest): Promise<Voice[]> {
      const config = req?.config ?? {};
      const apiKey = resolveApiKey(config, ENV_KEY);
      if (!apiKey) return [...VOICES];

      const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
      try {
        const fetchFn = req?.fetchFn ?? fetch;
        const resp = await fetchFn(`${baseUrl}/v1/voices`, {
          headers: { "xi-api-key": apiKey },
        });
        if (!resp.ok) return [...VOICES];
        const data = (await resp.json()) as { voices?: Array<{ voice_id: string; name: string; labels?: Record<string, string> }> };
        if (!data.voices) return [...VOICES];
        return data.voices.map((v) => ({
          id: v.voice_id,
          name: v.name,
          provider: "elevenlabs",
          language: "en",
          gender: (v.labels?.gender as Voice["gender"]) ?? "neutral",
        }));
      } catch {
        return [...VOICES];
      }
    },
  };
}

// ============================================================================
// 流式合成支持
// ============================================================================

/** ElevenLabs 流式合成参数。 */
export interface ElevenLabsStreamParams {
  text: string;
  apiKey?: string;
  baseUrl?: string;
  voiceId: string;
  modelId?: string;
  outputFormat?: string;
  voiceSettings?: {
    stability: number;
    similarityBoost: number;
    style: number;
    useSpeakerBoost: boolean;
    speed: number;
  };
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

/** 流式合成结果。 */
export interface ElevenLabsStreamResult {
  audioStream: ReadableStream<Uint8Array>;
  format: AudioFormat;
  release: () => Promise<void>;
}

/**
 * 流式合成语音，返回可读音频流。
 * 使用 ElevenLabs /v1/text-to-speech/{voice_id}/stream 端点。
 */
export async function elevenLabsStreamSynthesize(
  params: ElevenLabsStreamParams,
): Promise<ElevenLabsStreamResult> {
  const apiKey = params.apiKey ?? process.env[ENV_KEY];
  if (!apiKey) throw new Error("ElevenLabs TTS 未配置 API Key（ELEVENLABS_API_KEY）");

  const baseUrl = (params.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  if (!isValidVoiceId(params.voiceId)) {
    throw new Error(`Invalid ElevenLabs voiceId: ${params.voiceId}`);
  }

  const modelId = params.modelId ?? "eleven_multilingual_v2";
  const outputFormat = params.outputFormat ?? "mp3_44100_128";
  const format: AudioFormat = OUTPUT_FORMAT_MAP[outputFormat] ?? "mp3";
  const voiceSettings = params.voiceSettings ?? {
    stability: 0.5,
    similarityBoost: 0.75,
    style: 0,
    useSpeakerBoost: true,
    speed: 1,
  };

  const url = `${baseUrl}/v1/text-to-speech/${params.voiceId}/stream?output_format=${outputFormat}`;
  const body = buildElevenLabsRequest(params.text, modelId, voiceSettings);

  const fetchFn = params.fetchFn ?? fetch;
  const controller = new AbortController();
  const timeout = params.timeoutMs ?? 30_000;
  const timer = setTimeout(() => controller.abort(), timeout);

  const resp = await fetchFn(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  });

  if (!resp.ok) {
    clearTimeout(timer);
    const errText = await resp.text().catch(() => "");
    throw new Error(`ElevenLabs stream error ${resp.status}: ${errText.slice(0, 200)}`);
  }

  if (!resp.body) {
    clearTimeout(timer);
    throw new Error("ElevenLabs stream response missing body");
  }

  return {
    audioStream: resp.body,
    format,
    release: async () => {
      clearTimeout(timer);
    },
  };
}

export const elevenlabsProvider = createElevenLabsProvider();
export default elevenlabsProvider;

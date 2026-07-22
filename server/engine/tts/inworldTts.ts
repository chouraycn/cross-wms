/**
 * Inworld TTS Provider。
 *
 * 基于 Inworld text-to-speech 流式 API，使用 HTTP Basic 认证
 * （apiKey 作为 Basic 凭证原样发送），支持角色声音、多模型与流式输出。
 *
 * 参考 openclaw/extensions/inworld/tts.ts 的实现逻辑，
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
import { resolveApiKey, pickFormat } from "./providers/shared.js";

const ENV_KEY = "INWORLD_API_KEY";
const DEFAULT_BASE_URL = "https://api.inworld.ai/v1";

/** 默认角色声音。 */
export const DEFAULT_INWORLD_VOICE_ID = "Sarah";
/** 默认模型。 */
export const DEFAULT_INWORLD_MODEL_ID = "inworld-tts-1.5-max";

/** 支持的 Inworld TTS 模型。 */
export const INWORLD_TTS_MODELS = [
  "inworld-tts-1.5-max",
  "inworld-tts-1.5-mini",
  "inworld-tts-1-max",
  "inworld-tts-1",
] as const;

/** Inworld 音频编码类型。 */
export type InworldAudioEncoding =
  | "MP3"
  | "OGG_OPUS"
  | "LINEAR16"
  | "PCM"
  | "WAV"
  | "ALAW"
  | "MULAW"
  | "FLAC";

/** Inworld 音频编码到 AudioFormat 的映射。 */
const AUDIO_ENCODING_MAP: Record<InworldAudioEncoding, AudioFormat> = {
  MP3: "mp3",
  OGG_OPUS: "opus",
  LINEAR16: "wav",
  PCM: "pcm",
  WAV: "wav",
  ALAW: "pcm",
  MULAW: "pcm",
  FLAC: "wav",
};

/** AudioFormat 到 Inworld 音频编码的反向映射（挑选最贴近的编码）。 */
function formatToAudioEncoding(format: AudioFormat): InworldAudioEncoding {
  switch (format) {
    case "mp3":
      return "MP3";
    case "opus":
      return "OGG_OPUS";
    case "wav":
      return "WAV";
    case "pcm":
      return "PCM";
    case "aac":
      return "MP3";
    default:
      return "MP3";
  }
}

/** 内置预设角色声音。 */
const VOICES: readonly Voice[] = [
  { id: "Sarah", name: "Sarah", provider: "inworld", language: "en", gender: "female" },
  { id: "Alex", name: "Alex", provider: "inworld", language: "en", gender: "male" },
  { id: "Mia", name: "Mia", provider: "inworld", language: "en", gender: "female" },
  { id: "Joey", name: "Joey", provider: "inworld", language: "en", gender: "male" },
  { id: "Emma", name: "Emma", provider: "inworld", language: "en", gender: "female" },
  { id: "Christopher", name: "Christopher", provider: "inworld", language: "en", gender: "male" },
];

const SUPPORTED_FORMATS: readonly AudioFormat[] = ["mp3", "opus", "wav", "pcm"];

/** 构造 Inworld TTS 请求体。 */
export function buildInworldRequest(
  text: string,
  voiceId: string,
  modelId: string,
  audioEncoding: InworldAudioEncoding,
  sampleRateHertz?: number,
  temperature?: number,
): Record<string, unknown> {
  return {
    text,
    voiceId,
    modelId,
    audioConfig: {
      audioEncoding,
      ...(sampleRateHertz ? { sampleRateHertz } : {}),
    },
    ...(temperature != null ? { temperature } : {}),
  };
}

/**
 * 解析 Inworld 流式响应（newline-delimited JSON），将每行的 base64 音频
 * 拼接为单个 Buffer。
 */
async function parseInworldStream(response: Response): Promise<Buffer> {
  const body = await response.text();
  const chunks: Buffer[] = [];

  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let parsed: {
      result?: { audioContent?: string };
      error?: { code?: number; message?: string };
    };
    try {
      parsed = JSON.parse(trimmed) as typeof parsed;
    } catch {
      throw new Error(
        `Inworld TTS stream parse error: unexpected non-JSON line: ${trimmed.slice(0, 80)}`,
      );
    }

    if (parsed.error) {
      throw new Error(`Inworld TTS stream error (${parsed.error.code}): ${parsed.error.message}`);
    }

    if (parsed.result?.audioContent) {
      chunks.push(Buffer.from(parsed.result.audioContent, "base64"));
    }
  }

  if (chunks.length === 0) {
    throw new Error("Inworld TTS returned no audio data");
  }

  return Buffer.concat(chunks);
}

/** 创建 Inworld TTS Provider 插件。 */
export function createInworldProvider(): TTSProviderPlugin {
  return {
    id: "inworld",
    label: "Inworld",
    aliases: ["inworld-tts"],
    autoSelectOrder: 40,
    languages: ["en"],
    voices: VOICES,
    defaultVoice: DEFAULT_INWORLD_VOICE_ID,
    defaultModel: DEFAULT_INWORLD_MODEL_ID,
    supportedFormats: SUPPORTED_FORMATS,
    defaultFormat: "mp3",
    isConfigured(config: ProviderConfig): boolean {
      return Boolean(resolveApiKey(config, ENV_KEY));
    },
    async synthesize(req: SynthesizeRequest): Promise<SynthesizeResult> {
      const apiKey = resolveApiKey(req.config, ENV_KEY);
      if (!apiKey) throw new Error("Inworld TTS 未配置 API Key（INWORLD_API_KEY）");

      const baseUrl = (req.config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
      const voice = req.voice ?? req.config.voice ?? this.defaultVoice;
      const model = req.config.model ?? this.defaultModel;
      const format = pickFormat(
        SUPPORTED_FORMATS,
        req.format ?? req.config.format,
        this.defaultFormat,
      ) as AudioFormat;
      const audioEncoding = formatToAudioEncoding(format);

      const url = `${baseUrl}/tts`;
      const body = buildInworldRequest(
        req.text,
        voice,
        model,
        audioEncoding,
        req.sampleRate ?? req.config.sampleRate,
        typeof req.config.temperature === "number" ? req.config.temperature : undefined,
      );

      const fetchFn = req.fetchFn ?? fetch;
      const controller = new AbortController();
      const timeout = req.timeoutMs ?? 30_000;
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const resp = await fetchFn(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // apiKey 是从 Inworld 控制台复制的 Base64 编码凭证字符串，
            // 原样作为 HTTP Basic 凭证发送，不要在此二次 Base64 编码，
            // 也不要将其规范化为 bearer 风格令牌。
            Authorization: `Basic ${apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!resp.ok) {
          const errorBody = await resp.text().catch(() => "");
          throw new Error(`Inworld TTS API error (${resp.status}): ${errorBody.slice(0, 200)}`);
        }

        const audio = await parseInworldStream(resp);

        return {
          audio,
          format,
          metadata: {
            provider: "inworld",
            voice,
            model,
            audioEncoding,
          },
        };
      } finally {
        clearTimeout(timer);
      }
    },
    async listVoices(req?: ListVoicesRequest): Promise<Voice[]> {
      const config = req?.config ?? {};
      const apiKey = resolveApiKey(config, ENV_KEY);
      if (!apiKey) return [...VOICES];

      const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
      const language = typeof config.language === "string" ? config.language : undefined;
      const langParam = language ? `?languages=${encodeURIComponent(language)}` : "";
      const url = `${baseUrl}/voices${langParam}`;

      try {
        const fetchFn = req?.fetchFn ?? fetch;
        const resp = await fetchFn(url, {
          method: "GET",
          headers: { Authorization: `Basic ${apiKey}` },
        });
        if (!resp.ok) return [...VOICES];

        const json = (await resp.json()) as {
          voices?: Array<{
            voiceId?: string;
            displayName?: string;
            description?: string;
            langCode?: string;
            tags?: string[];
            source?: string;
          }>;
        };

        if (!Array.isArray(json.voices)) return [...VOICES];

        return json.voices
          .map((voice) => ({
            id: voice.voiceId?.trim() ?? "",
            name: voice.displayName?.trim() || undefined,
            provider: "inworld",
            description: voice.description?.trim() || undefined,
            locale: voice.langCode || undefined,
            language: voice.langCode?.split("-")[0],
            gender:
              (voice.tags?.find((t) => t === "male" || t === "female") as Voice["gender"]) ??
              "neutral",
          }))
          .filter((voice) => voice.id.length > 0);
      } catch {
        return [...VOICES];
      }
    },
  };
}

// ============================================================================
// 流式合成支持
// ============================================================================

/** Inworld 流式合成参数。 */
export interface InworldStreamParams {
  text: string;
  apiKey?: string;
  baseUrl?: string;
  voiceId?: string;
  modelId?: string;
  audioEncoding?: InworldAudioEncoding;
  sampleRateHertz?: number;
  temperature?: number;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

/** 流式合成结果。 */
export interface InworldStreamResult {
  audioStream: ReadableStream<Uint8Array>;
  format: AudioFormat;
  release: () => Promise<void>;
}

/**
 * 流式合成语音，返回可读音频流。
 * Inworld /v1/tts 端点返回 newline-delimited JSON，每行携带 base64 音频。
 * 这里将响应体直接作为可读流传出，由调用方自行解析 NDJSON。
 */
export async function inworldStreamSynthesize(
  params: InworldStreamParams,
): Promise<InworldStreamResult> {
  const apiKey = params.apiKey ?? process.env[ENV_KEY];
  if (!apiKey) throw new Error("Inworld TTS 未配置 API Key（INWORLD_API_KEY）");

  const baseUrl = (params.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const voiceId = params.voiceId ?? DEFAULT_INWORLD_VOICE_ID;
  const modelId = params.modelId ?? DEFAULT_INWORLD_MODEL_ID;
  const audioEncoding = params.audioEncoding ?? "MP3";
  const format: AudioFormat = AUDIO_ENCODING_MAP[audioEncoding];

  const url = `${baseUrl}/tts`;
  const body = buildInworldRequest(
    params.text,
    voiceId,
    modelId,
    audioEncoding,
    params.sampleRateHertz,
    params.temperature,
  );

  const fetchFn = params.fetchFn ?? fetch;
  const controller = new AbortController();
  const timeout = params.timeoutMs ?? 30_000;
  const timer = setTimeout(() => controller.abort(), timeout);

  const resp = await fetchFn(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  });

  if (!resp.ok) {
    clearTimeout(timer);
    const errText = await resp.text().catch(() => "");
    throw new Error(`Inworld stream error ${resp.status}: ${errText.slice(0, 200)}`);
  }

  if (!resp.body) {
    clearTimeout(timer);
    throw new Error("Inworld stream response missing body");
  }

  return {
    audioStream: resp.body,
    format,
    release: async () => {
      clearTimeout(timer);
    },
  };
}

export const inworldProvider = createInworldProvider();
export default inworldProvider;

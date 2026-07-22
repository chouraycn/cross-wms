/**
 * Gradium TTS Provider。
 *
 * 基于 Gradium text-to-speech API，支持 API key 认证（x-api-key 头）、
 * 多种预设声音和流式音频输出。
 *
 * 参考 openclaw/extensions/gradium/tts.ts 的实现逻辑，
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

const ENV_KEY = "GRADIUM_API_KEY";
const DEFAULT_BASE_URL = "https://api.gradium.co/v1";

/** Gradium 原生输出格式到 AudioFormat 的映射。 */
const OUTPUT_FORMAT_MAP: Record<string, AudioFormat> = {
  wav: "wav",
  opus: "opus",
  pcm: "pcm",
  pcm_24000: "pcm",
  ulaw_8000: "pcm",
  alaw_8000: "pcm",
};

/** 内置预设声音（参考 openclaw/extensions/gradium/shared.ts）。 */
const VOICES: readonly Voice[] = [
  { id: "YTpq7expH9539ERJ", name: "Emma", provider: "gradium", language: "en", gender: "female" },
  { id: "LFZvm12tW_z0xfGo", name: "Kent", provider: "gradium", language: "en", gender: "male" },
  { id: "Eu9iL_CYe8N-Gkx_", name: "Tiffany", provider: "gradium", language: "en", gender: "female" },
  { id: "2H4HY2CBNyJHBCrP", name: "Christina", provider: "gradium", language: "en", gender: "female" },
  { id: "jtEKaLYNn6iif5PR", name: "Sydney", provider: "gradium", language: "en", gender: "female" },
  { id: "KWJiFWu2O9nMPYcR", name: "John", provider: "gradium", language: "en", gender: "male" },
  { id: "3jUdJyOi9pgbxBTK", name: "Arthur", provider: "gradium", language: "en", gender: "male" },
];

const SUPPORTED_FORMATS: readonly AudioFormat[] = ["wav", "opus", "pcm"];

/** 默认输出格式。 */
const DEFAULT_OUTPUT_FORMAT = "wav";

/** 校验 voiceId 格式（Gradium voice id 为字母数字与下划线/连字符组合）。 */
function isValidVoiceId(voiceId: string): boolean {
  return /^[a-zA-Z0-9_-]{6,40}$/.test(voiceId);
}

/** 将 AudioFormat 转换为 Gradium output_format 参数。 */
function formatToOutputFormat(format: AudioFormat): string {
  switch (format) {
    case "wav":
      return "wav";
    case "opus":
      return "opus";
    case "pcm":
      return "pcm_24000";
    default:
      return DEFAULT_OUTPUT_FORMAT;
  }
}

/** 构造 Gradium TTS 请求体。 */
export function buildGradiumRequest(
  text: string,
  voiceId: string,
  outputFormat: string,
): Record<string, unknown> {
  return {
    text,
    voice_id: voiceId,
    only_audio: true,
    output_format: outputFormat,
    json_config: JSON.stringify({ padding_bonus: 0 }),
  };
}

/** 创建 Gradium TTS Provider 插件。 */
export function createGradiumProvider(): TTSProviderPlugin {
  return {
    id: "gradium",
    label: "Gradium",
    aliases: ["gradium-tts"],
    autoSelectOrder: 30,
    languages: ["en"],
    voices: VOICES,
    defaultVoice: "YTpq7expH9539ERJ",
    defaultModel: "gradium-tts",
    supportedFormats: SUPPORTED_FORMATS,
    defaultFormat: DEFAULT_OUTPUT_FORMAT as AudioFormat,
    isConfigured(config: ProviderConfig): boolean {
      return Boolean(resolveApiKey(config, ENV_KEY));
    },
    async synthesize(req: SynthesizeRequest): Promise<SynthesizeResult> {
      const apiKey = resolveApiKey(req.config, ENV_KEY);
      if (!apiKey) throw new Error("Gradium TTS 未配置 API Key（GRADIUM_API_KEY）");

      const baseUrl = (req.config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
      const voice = req.voice ?? req.config.voice ?? this.defaultVoice;
      if (!isValidVoiceId(voice)) {
        throw new Error(`Invalid Gradium voiceId: ${voice}`);
      }
      const format = pickFormat(
        SUPPORTED_FORMATS,
        req.format ?? req.config.format,
        this.defaultFormat,
      ) as AudioFormat;
      const outputFormat = formatToOutputFormat(format);

      const url = `${baseUrl}/tts`;
      const body = buildGradiumRequest(req.text, voice, outputFormat);

      const res = await postJsonBinary({
        url,
        headers: {
          "x-api-key": apiKey,
          Accept: "audio/wav",
        },
        body,
        timeoutMs: req.timeoutMs,
        fetchFn: req.fetchFn,
      });

      if (!res.ok) {
        const json = res.json as { detail?: string; message?: string; error?: string } | undefined;
        const detail =
          json?.detail ?? json?.message ?? json?.error ?? res.data.toString("utf8").slice(0, 200);
        throw new Error(`Gradium TTS 错误: ${detail}`);
      }

      return {
        audio: res.data,
        format,
        metadata: {
          provider: "gradium",
          voice,
          outputFormat,
        },
      };
    },
    async listVoices(req?: ListVoicesRequest): Promise<Voice[]> {
      const config = req?.config ?? {};
      const apiKey = resolveApiKey(config, ENV_KEY);
      // Gradium 没有公开的列声音端点，直接返回预设列表
      if (!apiKey) return [...VOICES];
      return [...VOICES];
    },
  };
}

// ============================================================================
// 流式合成支持
// ============================================================================

/** Gradium 流式合成参数。 */
export interface GradiumStreamParams {
  text: string;
  apiKey?: string;
  baseUrl?: string;
  voiceId: string;
  outputFormat?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

/** 流式合成结果。 */
export interface GradiumStreamResult {
  audioStream: ReadableStream<Uint8Array>;
  format: AudioFormat;
  release: () => Promise<void>;
}

/**
 * 流式合成语音，返回可读音频流。
 * 复用 Gradium /v1/tts 端点，通过流式响应体获取分片音频。
 */
export async function gradiumStreamSynthesize(
  params: GradiumStreamParams,
): Promise<GradiumStreamResult> {
  const apiKey = params.apiKey ?? process.env[ENV_KEY];
  if (!apiKey) throw new Error("Gradium TTS 未配置 API Key（GRADIUM_API_KEY）");

  const baseUrl = (params.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  if (!isValidVoiceId(params.voiceId)) {
    throw new Error(`Invalid Gradium voiceId: ${params.voiceId}`);
  }

  const outputFormat = params.outputFormat ?? DEFAULT_OUTPUT_FORMAT;
  const format: AudioFormat = OUTPUT_FORMAT_MAP[outputFormat] ?? "wav";
  const url = `${baseUrl}/tts`;
  const body = buildGradiumRequest(params.text, params.voiceId, outputFormat);

  const fetchFn = params.fetchFn ?? fetch;
  const controller = new AbortController();
  const timeout = params.timeoutMs ?? 30_000;
  const timer = setTimeout(() => controller.abort(), timeout);

  const resp = await fetchFn(url, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/wav",
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  });

  if (!resp.ok) {
    clearTimeout(timer);
    const errText = await resp.text().catch(() => "");
    throw new Error(`Gradium stream error ${resp.status}: ${errText.slice(0, 200)}`);
  }

  if (!resp.body) {
    clearTimeout(timer);
    throw new Error("Gradium stream response missing body");
  }

  return {
    audioStream: resp.body,
    format,
    release: async () => {
      clearTimeout(timer);
    },
  };
}

export const gradiumProvider = createGradiumProvider();
export default gradiumProvider;

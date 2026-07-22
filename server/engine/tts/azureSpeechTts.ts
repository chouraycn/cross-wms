/**
 * Microsoft Azure Speech TTS Provider。
 *
 * 基于 Azure Speech Service REST API（cognitiveservices/v1），使用
 * Ocp-Apim-Subscription-Key 头认证，支持区域配置、SSML 输入、
 * 多种神经网络声音与多语言。
 *
 * 参考 openclaw/extensions/azure-speech/tts.ts 与
 * openclaw/extensions/microsoft/tts.ts 的实现逻辑，
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

const ENV_KEY = "AZURE_SPEECH_API_KEY";
const ENV_REGION = "AZURE_SPEECH_REGION";

/** 默认 Azure Speech 神经声音。 */
export const DEFAULT_AZURE_SPEECH_VOICE = "en-US-JennyNeural";
/** 默认 Azure Speech 语言。 */
export const DEFAULT_AZURE_SPEECH_LANG = "en-US";
/** 默认全音频输出格式。 */
export const DEFAULT_AZURE_SPEECH_AUDIO_FORMAT = "audio-24khz-48kbitrate-mono-mp3";
/** 默认语音备注输出格式。 */
export const DEFAULT_AZURE_SPEECH_VOICE_NOTE_FORMAT = "ogg-24khz-16bit-mono-opus";
/** 默认电话输出格式。 */
export const DEFAULT_AZURE_SPEECH_TELEPHONY_FORMAT = "raw-8khz-8bit-mono-mulaw";

/** Azure 输出格式到 AudioFormat 的映射关键字。 */
const OUTPUT_FORMAT_KEYWORD_MAP: Array<{ keyword: string; format: AudioFormat }> = [
  { keyword: "mp3", format: "mp3" },
  { keyword: "ogg", format: "opus" },
  { keyword: "opus", format: "opus" },
  { keyword: "webm", format: "opus" },
  { keyword: "riff", format: "wav" },
  { keyword: "wav", format: "wav" },
  { keyword: "raw", format: "pcm" },
  { keyword: "pcm", format: "pcm" },
];

/** 内置预设神经网络声音（覆盖多种语言）。 */
const VOICES: readonly Voice[] = [
  { id: "en-US-JennyNeural", name: "Jenny", provider: "azure-speech", language: "en", locale: "en-US", gender: "female" },
  { id: "en-US-GuyNeural", name: "Guy", provider: "azure-speech", language: "en", locale: "en-US", gender: "male" },
  { id: "en-US-AriaNeural", name: "Aria", provider: "azure-speech", language: "en", locale: "en-US", gender: "female" },
  { id: "en-US-DavisNeural", name: "Davis", provider: "azure-speech", language: "en", locale: "en-US", gender: "male" },
  { id: "zh-CN-XiaoxiaoNeural", name: "晓晓", provider: "azure-speech", language: "zh", locale: "zh-CN", gender: "female" },
  { id: "zh-CN-YunxiNeural", name: "云希", provider: "azure-speech", language: "zh", locale: "zh-CN", gender: "male" },
  { id: "zh-CN-XiaoyiNeural", name: "晓伊", provider: "azure-speech", language: "zh", locale: "zh-CN", gender: "female" },
  { id: "zh-CN-YunyangNeural", name: "云扬", provider: "azure-speech", language: "zh", locale: "zh-CN", gender: "male" },
  { id: "ja-JP-NanamiNeural", name: "七海", provider: "azure-speech", language: "ja", locale: "ja-JP", gender: "female" },
  { id: "ja-JP-KeitaNeural", name: "圭太", provider: "azure-speech", language: "ja", locale: "ja-JP", gender: "male" },
  { id: "ko-KR-SunHiNeural", name: "선히", provider: "azure-speech", language: "ko", locale: "ko-KR", gender: "female" },
  { id: "fr-FR-DeniseNeural", name: "Denise", provider: "azure-speech", language: "fr", locale: "fr-FR", gender: "female" },
  { id: "de-DE-KatjaNeural", name: "Katja", provider: "azure-speech", language: "de", locale: "de-DE", gender: "female" },
  { id: "es-ES-ElviraNeural", name: "Elvira", provider: "azure-speech", language: "es", locale: "es-ES", gender: "female" },
];

const SUPPORTED_FORMATS: readonly AudioFormat[] = ["mp3", "opus", "wav", "pcm"];

/** 从配置或环境变量解析区域。 */
function resolveRegion(config: ProviderConfig): string | undefined {
  const region =
    typeof config.region === "string" ? config.region.trim() : "";
  if (region) return region;
  return process.env[ENV_REGION] ? String(process.env[ENV_REGION]).trim() : undefined;
}

/**
 * 解析并归一化 Azure Speech base URL。
 * 优先使用 baseUrl/endpoint，其次按 region 拼装。
 * 移除可能已附加的 /cognitiveservices/v1 后缀。
 */
export function normalizeAzureSpeechBaseUrl(config: ProviderConfig): string | undefined {
  const configured =
    (typeof config.baseUrl === "string" ? config.baseUrl.trim() : "") ||
    (typeof config.endpoint === "string" ? config.endpoint.trim() : "");
  if (configured) {
    return configured.replace(/\/+$/, "").replace(/\/cognitiveservices\/v1$/i, "");
  }
  const region = resolveRegion(config);
  return region ? `https://${region}.tts.speech.microsoft.com` : undefined;
}

/** XML 文本转义。 */
function escapeXmlText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** XML 属性转义。 */
function escapeXmlAttr(value: string): string {
  return escapeXmlText(value).replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** 构造 Azure Speech SSML 文档。 */
export function buildAzureSpeechSsml(params: {
  text: string;
  voice: string;
  lang?: string;
  rate?: string;
  pitch?: string;
  volume?: string;
}): string {
  const lang = params.lang?.trim() || DEFAULT_AZURE_SPEECH_LANG;
  const voice = params.voice;
  const text = params.text;
  const hasProsody = Boolean(params.rate || params.pitch || params.volume);
  const prosodyAttrs: string[] = [];
  if (params.rate) prosodyAttrs.push(`rate="${escapeXmlAttr(params.rate)}"`);
  if (params.pitch) prosodyAttrs.push(`pitch="${escapeXmlAttr(params.pitch)}"`);
  if (params.volume) prosodyAttrs.push(`volume="${escapeXmlAttr(params.volume)}"`);
  const inner = hasProsody
    ? `<prosody ${prosodyAttrs.join(" ")}>${escapeXmlText(text)}</prosody>`
    : escapeXmlText(text);
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" ` +
    `xml:lang="${escapeXmlAttr(lang)}">` +
    `<voice name="${escapeXmlAttr(voice)}">${inner}</voice>` +
    `</speak>`
  );
}

/** 将 AudioFormat 转换为 Azure output_format 参数。 */
function formatToOutputFormat(format: AudioFormat): string {
  switch (format) {
    case "mp3":
      return DEFAULT_AZURE_SPEECH_AUDIO_FORMAT;
    case "opus":
      return DEFAULT_AZURE_SPEECH_VOICE_NOTE_FORMAT;
    case "wav":
      return "riff-24khz-16bit-mono-pcm";
    case "pcm":
      return "raw-24khz-16bit-mono-pcm";
    default:
      return DEFAULT_AZURE_SPEECH_AUDIO_FORMAT;
  }
}

/** 从 Azure 输出格式推断 AudioFormat。 */
export function inferAudioFormatFromAzureOutput(outputFormat: string): AudioFormat {
  const normalized = outputFormat.toLowerCase();
  for (const { keyword, format } of OUTPUT_FORMAT_KEYWORD_MAP) {
    if (normalized.includes(keyword)) return format;
  }
  return "mp3";
}

/** 从语速数值（0.5~2.0）生成 Azure prosody rate 字符串。 */
function ratePercent(speed?: number): string | undefined {
  if (typeof speed !== "number" || speed === 1) return undefined;
  return `${Math.round((speed - 1) * 100)}%`;
}

/** 从音调数值（-6~6）生成 Azure prosody pitch 字符串。 */
function pitchPercent(pitch?: number): string | undefined {
  if (typeof pitch !== "number" || pitch === 0) return undefined;
  return `${Math.round(pitch * 50)}%`;
}

/** 从音量数值（0~100）生成 Azure prosody volume 字符串。 */
function volumePercent(volume?: number): string | undefined {
  if (typeof volume !== "number" || volume === 50) return undefined;
  return `${Math.round((volume - 50) * 2)}%`;
}

/** 创建 Azure Speech TTS Provider 插件。 */
export function createAzureSpeechProvider(): TTSProviderPlugin {
  return {
    id: "azure-speech",
    label: "Azure Speech",
    aliases: ["azure", "microsoft-speech", "azure-cognitive"],
    autoSelectOrder: 25,
    languages: ["en", "zh", "ja", "ko", "fr", "de", "es"],
    voices: VOICES,
    defaultVoice: DEFAULT_AZURE_SPEECH_VOICE,
    defaultModel: "azure-speech-neural",
    supportedFormats: SUPPORTED_FORMATS,
    defaultFormat: "mp3",
    isConfigured(config: ProviderConfig): boolean {
      return Boolean(resolveApiKey(config, ENV_KEY)) && Boolean(normalizeAzureSpeechBaseUrl(config));
    },
    async synthesize(req: SynthesizeRequest): Promise<SynthesizeResult> {
      const apiKey = resolveApiKey(req.config, ENV_KEY);
      if (!apiKey) throw new Error("Azure Speech TTS 未配置 API Key（AZURE_SPEECH_API_KEY）");

      const baseUrl = normalizeAzureSpeechBaseUrl(req.config);
      if (!baseUrl) {
        throw new Error("Azure Speech TTS 未配置区域（AZURE_SPEECH_REGION 或 config.region/endpoint）");
      }

      const voice = req.voice ?? req.config.voice ?? this.defaultVoice;
      const lang =
        req.language ??
        (typeof req.config.language === "string" ? req.config.language : undefined) ??
        DEFAULT_AZURE_SPEECH_LANG;
      const format = pickFormat(
        SUPPORTED_FORMATS,
        req.format ?? req.config.format,
        this.defaultFormat,
      ) as AudioFormat;
      const outputFormat = formatToOutputFormat(format);

      // 若调用方传入 SSML 文本，则直接使用；否则构造 SSML
      const ssml = req.ssml
        ? req.text
        : buildAzureSpeechSsml({
            text: req.text,
            voice,
            lang,
            rate: ratePercent(req.speed),
            pitch: pitchPercent(req.pitch),
            volume: volumePercent(req.volume),
          });

      const url = `${baseUrl}/cognitiveservices/v1`;
      const fetchFn = req.fetchFn ?? fetch;
      const controller = new AbortController();
      const timeout = req.timeoutMs ?? 30_000;
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const resp = await fetchFn(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/ssml+xml",
            "Ocp-Apim-Subscription-Key": apiKey,
            "X-Microsoft-OutputFormat": outputFormat,
            "User-Agent": "cross-wms",
          },
          body: ssml,
          signal: controller.signal,
        });

        if (!resp.ok) {
          const errorBody = await resp.text().catch(() => "");
          throw new Error(`Azure Speech TTS API error (${resp.status}): ${errorBody.slice(0, 200)}`);
        }

        const arrayBuf = await resp.arrayBuffer();
        const audio = Buffer.from(arrayBuf);

        return {
          audio,
          format,
          metadata: {
            provider: "azure-speech",
            voice,
            lang,
            outputFormat,
            ssml: req.ssml ?? false,
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

      const baseUrl = normalizeAzureSpeechBaseUrl(config);
      if (!baseUrl) return [...VOICES];

      const url = `${baseUrl}/cognitiveservices/voices/list`;
      const fetchFn = req?.fetchFn ?? fetch;

      try {
        const resp = await fetchFn(url, {
          method: "GET",
          headers: { "Ocp-Apim-Subscription-Key": apiKey },
        });
        if (!resp.ok) return [...VOICES];

        const voices = (await resp.json()) as Array<{
          ShortName?: string;
          DisplayName?: string;
          LocalName?: string;
          Locale?: string;
          Gender?: string;
          Status?: string;
          IsDeprecated?: boolean | string;
          VoiceTag?: {
            VoicePersonalities?: string[];
            TailoredScenarios?: string[];
          };
        }>;

        if (!Array.isArray(voices)) return [...VOICES];

        return voices
          .filter((voice) => !isDeprecatedVoice(voice))
          .map((voice) => ({
            id: voice.ShortName?.trim() ?? "",
            name: voice.DisplayName?.trim() || voice.LocalName?.trim(),
            provider: "azure-speech",
            locale: voice.Locale?.trim(),
            language: voice.Locale?.split("-")[0],
            gender: normalizeGender(voice.Gender),
            description: formatVoiceDescription(voice),
          }))
          .filter((voice) => voice.id.length > 0);
      } catch {
        return [...VOICES];
      }
    },
  };
}

/** 判断 Azure 声音是否已弃用。 */
function isDeprecatedVoice(entry: {
  IsDeprecated?: boolean | string;
  Status?: string;
}): boolean {
  if (entry.IsDeprecated === true) return true;
  if (typeof entry.IsDeprecated === "string" && entry.IsDeprecated.toLowerCase() === "true") {
    return true;
  }
  const status = entry.Status?.trim().toLowerCase();
  return status === "deprecated" || status === "retired" || status === "disabled";
}

/** 规范化 Azure 性别字段。 */
function normalizeGender(gender?: string): Voice["gender"] {
  const lower = gender?.trim().toLowerCase();
  if (lower === "male") return "male";
  if (lower === "female") return "female";
  return "neutral";
}

/** 拼装 Azure 声音描述。 */
function formatVoiceDescription(entry: {
  VoiceTag?: {
    VoicePersonalities?: string[];
    TailoredScenarios?: string[];
  };
}): string | undefined {
  const parts = [
    ...(entry.VoiceTag?.TailoredScenarios ?? []),
    ...(entry.VoiceTag?.VoicePersonalities ?? []),
  ].filter((value) => value?.trim());
  return parts.length > 0 ? parts.join(", ") : undefined;
}

// ============================================================================
// 流式合成支持
// ============================================================================

/** Azure Speech 流式合成参数。 */
export interface AzureSpeechStreamParams {
  text: string;
  apiKey?: string;
  baseUrl?: string;
  endpoint?: string;
  region?: string;
  voice?: string;
  lang?: string;
  outputFormat?: string;
  ssml?: string;
  rate?: string;
  pitch?: string;
  volume?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

/** 流式合成结果。 */
export interface AzureSpeechStreamResult {
  audioStream: ReadableStream<Uint8Array>;
  format: AudioFormat;
  release: () => Promise<void>;
}

/**
 * 流式合成语音，返回可读音频流。
 * Azure Speech 支持通过同一 /cognitiveservices/v1 端点返回流式音频，
 * 这里直接将响应体作为可读流传出。
 */
export async function azureSpeechStreamSynthesize(
  params: AzureSpeechStreamParams,
): Promise<AzureSpeechStreamResult> {
  const apiKey = params.apiKey ?? process.env[ENV_KEY];
  if (!apiKey) throw new Error("Azure Speech TTS 未配置 API Key（AZURE_SPEECH_API_KEY）");

  const baseUrl = resolveAzureStreamBaseUrl(params);
  if (!baseUrl) {
    throw new Error("Azure Speech TTS 未配置区域（AZURE_SPEECH_REGION 或 region/endpoint）");
  }

  const voice = params.voice ?? DEFAULT_AZURE_SPEECH_VOICE;
  const lang = params.lang ?? DEFAULT_AZURE_SPEECH_LANG;
  const outputFormat = params.outputFormat ?? DEFAULT_AZURE_SPEECH_AUDIO_FORMAT;
  const format = inferAudioFormatFromAzureOutput(outputFormat);

  const ssml = params.ssml
    ? params.text
    : buildAzureSpeechSsml({
        text: params.text,
        voice,
        lang,
        rate: params.rate,
        pitch: params.pitch,
        volume: params.volume,
      });

  const url = `${baseUrl}/cognitiveservices/v1`;
  const fetchFn = params.fetchFn ?? fetch;
  const controller = new AbortController();
  const timeout = params.timeoutMs ?? 30_000;
  const timer = setTimeout(() => controller.abort(), timeout);

  const resp = await fetchFn(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/ssml+xml",
      "Ocp-Apim-Subscription-Key": apiKey,
      "X-Microsoft-OutputFormat": outputFormat,
      "User-Agent": "cross-wms",
    },
    body: ssml,
    signal: controller.signal,
  });

  if (!resp.ok) {
    clearTimeout(timer);
    const errText = await resp.text().catch(() => "");
    throw new Error(`Azure Speech stream error ${resp.status}: ${errText.slice(0, 200)}`);
  }

  if (!resp.body) {
    clearTimeout(timer);
    throw new Error("Azure Speech stream response missing body");
  }

  return {
    audioStream: resp.body,
    format,
    release: async () => {
      clearTimeout(timer);
    },
  };
}

/** 解析流式参数中的 base URL。 */
function resolveAzureStreamBaseUrl(params: AzureSpeechStreamParams): string | undefined {
  const configured = (params.baseUrl?.trim() || params.endpoint?.trim());
  if (configured) {
    return configured.replace(/\/+$/, "").replace(/\/cognitiveservices\/v1$/i, "");
  }
  const region = params.region?.trim() || (process.env[ENV_REGION] ? String(process.env[ENV_REGION]).trim() : "");
  return region ? `https://${region}.tts.speech.microsoft.com` : undefined;
}

export const azureSpeechProvider = createAzureSpeechProvider();
export default azureSpeechProvider;

/**
 * Deepgram STT Provider 与 STT 共享类型。
 *
 * 本模块定义语音转文字（Speech-to-Text）的 Provider 插件契约
 * STTProviderPlugin，并提供 Deepgram 适配器实现：
 *  - API 端点: https://api.deepgram.com/v1/listen
 *  - 认证: Token <apiKey> 头
 *  - 支持流式语音识别与批量转录
 *  - 支持多种语言与模型（nova-3、nova-2、enhanced、base 等）
 *
 * 参考 openclaw/extensions/deepgram/audio.ts 的实现逻辑，
 * 适配为 server/engine/stt 的 STTProviderPlugin 接口。
 */

// ============================================================================
// STT 共享类型定义
// ============================================================================

/** 支持的音频输入格式。 */
export type SttAudioFormat = "mp3" | "wav" | "pcm" | "ogg" | "webm" | "flac" | "aac" | "m4a";

/** 内置 STT Provider 标识。 */
export type STTProviderId = "deepgram";

/** Provider 选择占位符，由解析器自动挑选。 */
export type STTProviderSelector = STTProviderId | "auto";

/** 支持的音频格式清单。 */
export const STT_AUDIO_FORMATS: readonly SttAudioFormat[] = [
  "mp3",
  "wav",
  "pcm",
  "ogg",
  "webm",
  "flac",
  "aac",
  "m4a",
];

/** 单个 Provider 的连接与转录配置。 */
export interface STTProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  language?: string;
  /** 是否启用智能断句。 */
  punctuate?: boolean;
  /** 是否启用说话人分离。 */
  diarize?: boolean;
  /** 是否启用脏词过滤。 */
  profanityFilter?: boolean;
  /** 是否启用数字格式化。 */
  numbers?: boolean;
  /** 是否返回逐字稿。 */
  utterances?: boolean;
  /** 采样率（Hz），仅对裸 PCM 必填。 */
  sampleRate?: number;
  /** 音频通道数。 */
  channels?: number;
  /** 是否多通道模式。 */
  multichannel?: boolean;
  /** 识别结果回调的 Webhook URL。 */
  callbackUrl?: string;
  enabled?: boolean;
  [key: string]: unknown;
}

/** STT 运行时顶层配置。 */
export interface STTConfig {
  provider?: STTProviderSelector;
  defaultLanguage?: string;
  defaultModel?: string;
  timeoutMs?: number;
  /** 单次转录音频最大字节。 */
  maxBytes?: number;
  streaming?: boolean;
  providers?: Record<string, STTProviderConfig>;
}

/** 转录请求。 */
export interface TranscribeRequest {
  /** 音频二进制数据。 */
  audio: Buffer;
  /** 音频 MIME 类型，如 audio/wav、audio/mpeg。 */
  mimeType?: string;
  /** 音频格式（与 mimeType 二选一）。 */
  format?: SttAudioFormat;
  provider?: STTProviderSelector;
  language?: string;
  model?: string;
  /** 是否流式识别。 */
  stream?: boolean;
  sampleRate?: number;
  channels?: number;
  punctuate?: boolean;
  diarize?: boolean;
  profanityFilter?: boolean;
  numbers?: boolean;
  utterances?: boolean;
  multichannel?: boolean;
  timeoutMs?: number;
  /** 额外查询参数，透传给 Provider。 */
  query?: Record<string, string | number | boolean | undefined>;
  metadata?: Record<string, unknown>;
  /** 可注入的 fetch 实现，便于测试/自定义传输。 */
  fetchFn?: typeof fetch;
}

/** 转录结果。 */
export interface TranscribeResult {
  /** 完整转录文本。 */
  text: string;
  provider: string;
  model: string;
  language?: string;
  /** 识别置信度（0~1）。 */
  confidence?: number;
  /** 音频时长（毫秒）。 */
  durationMs?: number;
  /** 逐句片段（utterances）。 */
  utterances?: TranscribeUtterance[];
  /** 说话人片段（diarization）。 */
  speakers?: TranscribeSpeaker[];
  /** 原始 Provider 元数据。 */
  metadata?: Record<string, unknown>;
}

/** 逐句片段。 */
export interface TranscribeUtterance {
  text: string;
  startMs: number;
  endMs: number;
  confidence?: number;
  speaker?: number;
  language?: string;
}

/** 说话人片段。 */
export interface TranscribeSpeaker {
  id: number;
  startMs: number;
  endMs: number;
}

/** 传给 Provider 的归一化转录请求。 */
export interface ProviderTranscribeRequest {
  audio: Buffer;
  config: STTProviderConfig;
  mimeType?: string;
  format?: SttAudioFormat;
  language?: string;
  model?: string;
  sampleRate?: number;
  channels?: number;
  punctuate?: boolean;
  diarize?: boolean;
  profanityFilter?: boolean;
  numbers?: boolean;
  utterances?: boolean;
  multichannel?: boolean;
  timeoutMs?: number;
  query?: Record<string, string | number | boolean | undefined>;
  fetchFn?: typeof fetch;
}

/** 流式转录分块。 */
export interface STTStreamChunk {
  /** 增量文本（可能是部分识别或最终识别）。 */
  text: string;
  /** 是否为该片段的最终结果。 */
  isFinal: boolean;
  /** 说话人编号（启用 diarize 时）。 */
  speaker?: number;
  /** 语音开始时间（毫秒）。 */
  startMs?: number;
  /** 语音结束时间（毫秒）。 */
  endMs?: number;
  /** 置信度。 */
  confidence?: number;
  sequence: number;
}

/** 列举模型请求。 */
export interface ListModelsRequest {
  config?: STTProviderConfig;
  fetchFn?: typeof fetch;
}

/** STT Provider 插件契约（与 TTSProviderPlugin 对称）。 */
export interface STTProviderPlugin {
  id: string;
  label: string;
  aliases?: string[];
  /** 自动选择排序权重，越小越优先。 */
  autoSelectOrder: number;
  languages: readonly string[];
  models: readonly string[];
  defaultModel: string;
  defaultLanguage: string;
  supportedFormats: readonly SttAudioFormat[];
  defaultFormat: SttAudioFormat;
  /** 该 Provider 是否已具备转录所需配置（如 API Key）。 */
  isConfigured(config: STTProviderConfig): boolean;
  /** 执行一次性（批量）转录。 */
  transcribe(req: ProviderTranscribeRequest): Promise<TranscribeResult>;
  /** 列举可用模型。 */
  listModels?(req?: ListModelsRequest): Promise<string[]>;
}

/** 从 STTProviderConfig 读取 API Key，依次回退到环境变量。 */
export function resolveSttApiKey(
  config: { apiKey?: string },
  envKey: string,
): string | undefined {
  return (
    config.apiKey?.trim() ||
    (process.env[envKey] ? String(process.env[envKey]).trim() : undefined)
  );
}

/** 选择 Provider 支持且与目标一致的格式，否则回退到 Provider 默认格式。 */
export function pickSttFormat(
  supported: readonly string[],
  preferred: string | undefined,
  fallback: string,
): string {
  if (preferred && supported.includes(preferred)) return preferred;
  return fallback;
}

// ============================================================================
// Deepgram STT 实现
// ============================================================================

const ENV_KEY = "DEEPGRAM_API_KEY";
const DEFAULT_BASE_URL = "https://api.deepgram.com/v1";
export const DEFAULT_DEEPGRAM_MODEL = "nova-3";

/** 支持的 Deepgram 模型清单。 */
export const DEEPGRAM_MODELS = [
  "nova-3",
  "nova-2",
  "nova-2-general",
  "nova-2-meeting",
  "nova-2-phonecall",
  "nova-2-finance",
  "nova-2-conversationalai",
  "nova-2-video",
  "enhanced",
  "enhanced-general",
  "base",
  "base-general",
  "base-meeting",
  "base-phonecall",
  "base-finance",
  "base-conversationalai",
  "whisper-large",
  "whisper-tiny",
] as const;

/** Deepgram 支持的音频格式。 */
const SUPPORTED_FORMATS: readonly SttAudioFormat[] = [
  "mp3",
  "wav",
  "pcm",
  "ogg",
  "webm",
  "flac",
  "aac",
  "m4a",
];

/** AudioFormat 到 MIME 类型的映射。 */
const FORMAT_TO_MIME: Record<SttAudioFormat, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  pcm: "audio/raw",
  ogg: "audio/ogg",
  webm: "audio/webm",
  flac: "audio/flac",
  aac: "audio/aac",
  m4a: "audio/mp4",
};

/** Deepgram API 响应结构。 */
interface DeepgramResponse {
  metadata?: {
    model_info?: Record<string, unknown>;
    model_uuid?: string;
    transaction_id?: string;
    sha256?: string;
    created?: string;
    duration?: number;
    channels?: number;
    [key: string]: unknown;
  };
  results?: {
    channels?: Array<{
      alternatives?: Array<{
        transcript?: string;
        confidence?: number;
        words?: Array<{
          word?: string;
          start?: number;
          end?: number;
          confidence?: number;
          speaker?: number;
        }>;
        [key: string]: unknown;
      }>;
      detected_language?: string;
      language?: string;
    }>;
    utterances?: Array<{
      transcript?: string;
      start?: number;
      end?: number;
      confidence?: number;
      speaker?: number;
      channel?: number;
      language?: string;
    }>;
  };
}

/** 解析 Deepgram 响应为 TranscribeResult。 */
function parseDeepgramResponse(
  payload: DeepgramResponse,
  model: string,
): TranscribeResult {
  const results = payload.results;
  if (!results || !Array.isArray(results.channels)) {
    throw new Error("Deepgram 转录失败：响应缺少 results.channels");
  }
  const channel = results.channels[0];
  if (!channel || !Array.isArray(channel.alternatives)) {
    throw new Error("Deepgram 转录失败：响应缺少 channel.alternatives");
  }
  const alternative = channel.alternatives[0];
  if (!alternative) {
    throw new Error("Deepgram 转录失败：响应缺少 alternative");
  }
  if (alternative.transcript !== undefined && typeof alternative.transcript !== "string") {
    throw new Error("Deepgram 转录失败：transcript 字段格式异常");
  }

  const text = alternative.transcript ?? "";
  const language =
    channel.detected_language ?? channel.language ?? undefined;

  const utterances: TranscribeUtterance[] | undefined = Array.isArray(results.utterances)
    ? results.utterances
        .map((u) => ({
          text: u.transcript ?? "",
          startMs: Math.round((u.start ?? 0) * 1000),
          endMs: Math.round((u.end ?? 0) * 1000),
          confidence: u.confidence,
          speaker: u.speaker,
          language: u.language ?? language,
        }))
        .filter((u) => u.text.length > 0)
    : undefined;

  const speakers: TranscribeSpeaker[] | undefined = utterances
    ? Array.from(
        utterances
          .reduce((acc, u) => {
            if (typeof u.speaker === "number") {
              const existing = acc.get(u.speaker);
              if (!existing || u.endMs > existing.endMs) {
                acc.set(u.speaker, { id: u.speaker, startMs: u.startMs, endMs: u.endMs });
              }
            }
            return acc;
          }, new Map<number, TranscribeSpeaker>())
          .values(),
      )
    : undefined;

  const durationMs =
    typeof payload.metadata?.duration === "number"
      ? Math.round(payload.metadata.duration * 1000)
      : undefined;

  return {
    text,
    provider: "deepgram",
    model,
    language,
    confidence: alternative.confidence,
    durationMs,
    utterances,
    speakers,
    metadata: {
      requestId: payload.metadata?.transaction_id,
      modelUuid: payload.metadata?.model_uuid,
      created: payload.metadata?.created,
      channels: payload.metadata?.channels,
    },
  };
}

/** 构造 Deepgram /v1/listen 查询参数。 */
export function buildDeepgramQuery(
  req: ProviderTranscribeRequest,
  defaultModel: string,
): URLSearchParams {
  const params = new URLSearchParams();
  const model = (req.model ?? req.config.model ?? defaultModel).trim() || defaultModel;
  params.set("model", model);

  const language = (req.language ?? req.config.language ?? "").trim();
  if (language) {
    params.set("language", language);
  }

  if (req.punctuate ?? req.config.punctuate) {
    params.set("punctuate", "true");
  }
  if (req.diarize ?? req.config.diarize) {
    params.set("diarize", "true");
  }
  if (req.profanityFilter ?? req.config.profanityFilter) {
    params.set("profanity_filter", "true");
  }
  if (req.numbers ?? req.config.numbers) {
    params.set("numbers", "true");
  }
  if (req.utterances ?? req.config.utterances) {
    params.set("utterances", "true");
  }
  if (req.multichannel ?? req.config.multichannel) {
    params.set("multichannel", "true");
  }
  if (req.sampleRate ?? req.config.sampleRate) {
    params.set("sample_rate", String(req.sampleRate ?? req.config.sampleRate));
  }
  if (req.channels ?? req.config.channels) {
    params.set("channels", String(req.channels ?? req.config.channels));
  }
  if (typeof req.config.callbackUrl === "string" && req.config.callbackUrl.trim()) {
    params.set("callback", req.config.callbackUrl.trim());
  }

  // 透传额外查询参数
  if (req.query) {
    for (const [key, value] of Object.entries(req.query)) {
      if (value !== undefined) {
        params.set(key, String(value));
      }
    }
  }

  return params;
}

/** 解析音频 MIME 类型，优先使用显式传入，其次按 format 推断。 */
function resolveMimeType(
  req: ProviderTranscribeRequest,
  fallbackFormat: SttAudioFormat,
): string {
  if (req.mimeType?.trim()) return req.mimeType.trim();
  const format = (req.format ?? fallbackFormat) as SttAudioFormat;
  return FORMAT_TO_MIME[format] ?? "application/octet-stream";
}

/** 创建 Deepgram STT Provider 插件。 */
export function createDeepgramProvider(): STTProviderPlugin {
  return {
    id: "deepgram",
    label: "Deepgram",
    aliases: ["deepgram-stt"],
    autoSelectOrder: 10,
    languages: [
      "en",
      "zh",
      "ja",
      "ko",
      "fr",
      "de",
      "es",
      "it",
      "pt",
      "nl",
      "hi",
      "ru",
      "ar",
      "tr",
      "pl",
      "sv",
      "uk",
    ],
    models: DEEPGRAM_MODELS,
    defaultModel: DEFAULT_DEEPGRAM_MODEL,
    defaultLanguage: "en",
    supportedFormats: SUPPORTED_FORMATS,
    defaultFormat: "wav",
    isConfigured(config: STTProviderConfig): boolean {
      return Boolean(resolveSttApiKey(config, ENV_KEY));
    },
    async transcribe(req: ProviderTranscribeRequest): Promise<TranscribeResult> {
      const apiKey = resolveSttApiKey(req.config, ENV_KEY);
      if (!apiKey) {
        throw new Error("Deepgram STT 未配置 API Key（DEEPGRAM_API_KEY）");
      }

      const baseUrl = (req.config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
      const model = (req.model ?? req.config.model ?? this.defaultModel).trim() || this.defaultModel;
      const params = buildDeepgramQuery(req, model);
      const url = `${baseUrl}/listen?${params.toString()}`;
      const mimeType = resolveMimeType(req, this.defaultFormat);

      const fetchFn = req.fetchFn ?? fetch;
      const controller = new AbortController();
      const timeout = req.timeoutMs ?? 60_000;
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const resp = await fetchFn(url, {
          method: "POST",
          headers: {
            Authorization: `Token ${apiKey}`,
            "Content-Type": mimeType,
          },
          body: new Uint8Array(req.audio),
          signal: controller.signal,
        });

        if (!resp.ok) {
          const errorBody = await resp.text().catch(() => "");
          throw new Error(
            `Deepgram STT API error (${resp.status}): ${errorBody.slice(0, 200)}`,
          );
        }

        const payload = (await resp.json()) as DeepgramResponse;
        return parseDeepgramResponse(payload, model);
      } finally {
        clearTimeout(timer);
      }
    },
    async listModels(req?: ListModelsRequest): Promise<string[]> {
      // Deepgram 没有公开的列模型端点，返回内置清单
      const config = req?.config ?? {};
      const apiKey = resolveSttApiKey(config, ENV_KEY);
      if (!apiKey) return [...DEEPGRAM_MODELS];
      return [...DEEPGRAM_MODELS];
    },
  };
}

// ============================================================================
// 流式转录支持
// ============================================================================

/** Deepgram 流式转录参数。 */
export interface DeepgramStreamParams {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  language?: string;
  punctuate?: boolean;
  diarize?: boolean;
  profanityFilter?: boolean;
  numbers?: boolean;
  utterances?: boolean;
  multichannel?: boolean;
  sampleRate?: number;
  channels?: number;
  encoding?: "linear16" | "mulaw" | "alaw" | "flac" | "opus";
  /** 可注入的 WebSocket 实现（Node 环境默认使用全局 WebSocket）。 */
  WebSocketImpl?: typeof WebSocket;
  timeoutMs?: number;
}

/** Deepgram 流式转录会话。 */
export interface DeepgramStreamSession {
  /** 发送音频分片到 Deepgram。 */
  send(audio: Buffer | string): void;
  /** 主动结束发送（发送 close 帧）。 */
  finish(): void;
  /** 关闭连接并释放资源。 */
  close(): void;
  /** 接收转录分片的异步迭代器。 */
  chunks: AsyncIterable<STTStreamChunk>;
  /** 连接就绪的 Promise。 */
  ready: Promise<void>;
}

/**
 * 建立到 Deepgram 的 WebSocket 流式转录会话。
 *
 * Deepgram 流式端点为 wss://api.deepgram.com/v1/listen，使用
 * `Token <apiKey>` 鉴权。音频以二进制帧发送，结果以 JSON 帧返回。
 *
 * 注意：本实现使用标准 WebSocket API。Node 环境下需提供 WebSocketImpl
 * （如 `ws` 包），或确保全局 WebSocket 可用（Node 22+ 内置）。
 */
export function deepgramStreamTranscribe(
  params: DeepgramStreamParams,
): DeepgramStreamSession {
  const apiKey = params.apiKey ?? process.env[ENV_KEY];
  if (!apiKey) {
    throw new Error("Deepgram STT 未配置 API Key（DEEPGRAM_API_KEY）");
  }

  const baseUrl = (params.baseUrl ?? DEFAULT_BASE_URL)
    .replace(/\/+$/, "")
    .replace(/^https?:\/\//, "");
  const model = (params.model ?? DEFAULT_DEEPGRAM_MODEL).trim() || DEFAULT_DEEPGRAM_MODEL;

  const wsUrl = new URL(`wss://${baseUrl}/listen`);
  wsUrl.searchParams.set("model", model);
  if (params.language?.trim()) {
    wsUrl.searchParams.set("language", params.language.trim());
  }
  if (params.punctuate) wsUrl.searchParams.set("punctuate", "true");
  if (params.diarize) wsUrl.searchParams.set("diarize", "true");
  if (params.profanityFilter) wsUrl.searchParams.set("profanity_filter", "true");
  if (params.numbers) wsUrl.searchParams.set("numbers", "true");
  if (params.utterances) wsUrl.searchParams.set("utterances", "true");
  if (params.multichannel) wsUrl.searchParams.set("multichannel", "true");
  if (params.sampleRate) wsUrl.searchParams.set("sample_rate", String(params.sampleRate));
  if (params.channels) wsUrl.searchParams.set("channels", String(params.channels));
  if (params.encoding) wsUrl.searchParams.set("encoding", params.encoding);

  const WebSocketCtor = params.WebSocketImpl ?? WebSocket;
  const socket = new WebSocketCtor(
    wsUrl.toString(),
    {
      headers: { Authorization: `Token ${apiKey}` },
    } as unknown as ConstructorParameters<typeof WebSocket>[1],
  );

  let sequence = 0;
  const chunkQueue: STTStreamChunk[] = [];
  let chunkResolve: ((chunk: STTStreamChunk | "done") => void) | null = null;
  let closed = false;

  const ready = new Promise<void>((resolve, reject) => {
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onError = (err: unknown) => {
      cleanup();
      reject(err instanceof Error ? err : new Error("Deepgram WebSocket connection failed"));
    };
    const cleanup = () => {
      socket.removeEventListener("open", onOpen as EventListener);
      socket.removeEventListener("error", onError as EventListener);
    };
    socket.addEventListener("open", onOpen as EventListener);
    socket.addEventListener("error", onError as EventListener);
  });

  socket.addEventListener("message", (event: MessageEvent) => {
    let data: string;
    if (typeof event.data === "string") {
      data = event.data;
    } else if (event.data instanceof ArrayBuffer) {
      data = new TextDecoder().decode(event.data);
    } else if (ArrayBuffer.isView(event.data)) {
      data = new TextDecoder().decode(event.data as Uint8Array);
    } else {
      return;
    }

    let parsed: DeepgramResponse;
    try {
      parsed = JSON.parse(data) as DeepgramResponse;
    } catch {
      return;
    }

    const channel = parsed.results?.channels?.[0];
    const alternative = channel?.alternatives?.[0];
    const transcript = alternative?.transcript ?? "";
    const isFinal = channel?.alternatives?.[0] !== undefined;

    if (!transcript) return;

    const words = alternative?.words;
    const firstWord = words?.[0];
    const lastWord = words?.[words.length - 1];

    const chunk: STTStreamChunk = {
      text: transcript,
      isFinal,
      speaker: words?.find((w) => typeof w.speaker === "number")?.speaker,
      startMs:
        firstWord?.start != null ? Math.round(firstWord.start * 1000) : undefined,
      endMs:
        lastWord?.end != null ? Math.round(lastWord.end * 1000) : undefined,
      confidence: alternative?.confidence,
      sequence: sequence++,
    };

    if (chunkResolve) {
      const resolve = chunkResolve;
      chunkResolve = null;
      resolve(chunk);
    } else {
      chunkQueue.push(chunk);
    }
  });

  socket.addEventListener("close", () => {
    closed = true;
    if (chunkResolve) {
      const resolve = chunkResolve;
      chunkResolve = null;
      resolve("done");
    }
  });

  socket.addEventListener("error", () => {
    closed = true;
    if (chunkResolve) {
      const resolve = chunkResolve;
      chunkResolve = null;
      resolve("done");
    }
  });

  const chunks: AsyncIterable<STTStreamChunk> = {
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<STTStreamChunk>> {
          if (chunkQueue.length > 0) {
            return { value: chunkQueue.shift()!, done: false };
          }
          if (closed) {
            return { value: undefined, done: true };
          }
          const result = await new Promise<STTStreamChunk | "done">((resolve) => {
            chunkResolve = resolve;
          });
          if (result === "done") {
            return { value: undefined, done: true };
          }
          return { value: result, done: false };
        },
      };
    },
  };

  return {
    send(audio: Buffer | string): void {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(audio);
      }
    },
    finish(): void {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "CloseStream" }));
      }
    },
    close(): void {
      closed = true;
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    },
    chunks,
    ready,
  };
}

export const deepgramProvider = createDeepgramProvider();
export default deepgramProvider;

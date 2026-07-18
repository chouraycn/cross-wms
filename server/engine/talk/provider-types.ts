/**
 * Talk provider types describe realtime voice provider configuration and APIs.
 *
 * 自包含实现，参考 openclaw/src/talk/provider-types.ts。
 * 用本地 TalkRuntimeConfig 替代 OpenClawConfig，避免外部依赖。
 */
import type { TalkTransport } from "./talk-events.js";

/** 运行时配置的极简占位类型（替代 openclaw 的 OpenClawConfig）。 */
export type TalkRuntimeConfig = Record<string, unknown>;

export type RealtimeVoiceProviderId = string;

export type RealtimeVoiceRole = "user" | "assistant";

export type RealtimeVoiceCloseReason = "completed" | "error";

export type RealtimeVoiceAudioFormat =
  | {
      encoding: "g711_ulaw";
      sampleRateHz: 8000;
      channels: 1;
    }
  | {
      encoding: "pcm16";
      sampleRateHz: 24000;
      channels: 1;
    };

export const REALTIME_VOICE_AUDIO_FORMAT_G711_ULAW_8KHZ: RealtimeVoiceAudioFormat = {
  encoding: "g711_ulaw",
  sampleRateHz: 8000,
  channels: 1,
};

export const REALTIME_VOICE_AUDIO_FORMAT_PCM16_24KHZ: RealtimeVoiceAudioFormat = {
  encoding: "pcm16",
  sampleRateHz: 24000,
  channels: 1,
};

export type RealtimeVoiceTool = {
  type: "function";
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
};

export type RealtimeVoiceToolCallEvent = {
  itemId: string;
  callId: string;
  name: string;
  args: unknown;
};

export type RealtimeVoiceToolResultOptions = {
  /**
   * Submit the tool result without prompting the realtime provider to generate a new assistant
   * response. Use when another channel has already delivered the user-visible answer.
   */
  suppressResponse?: boolean;
  willContinue?: boolean;
};

export type RealtimeVoiceBridgeEvent = {
  direction: "client" | "server";
  type: string;
  detail?: string;
  itemId?: string;
  responseId?: string;
};

export type RealtimeVoiceBridgeCallbacks = {
  onAudio: (audio: Buffer) => void;
  onClearAudio: () => void;
  onMark?: (markName: string) => void;
  onTranscript?: (role: RealtimeVoiceRole, text: string, isFinal: boolean) => void;
  onEvent?: (event: RealtimeVoiceBridgeEvent) => void;
  onToolCall?: (event: RealtimeVoiceToolCallEvent) => void;
  onReady?: () => void;
  onError?: (error: Error) => void;
  onClose?: (reason: RealtimeVoiceCloseReason) => void;
};

export type RealtimeVoiceProviderConfig = Record<string, unknown>;

export type RealtimeVoiceProviderCapabilities = {
  transports: TalkTransport[];
  inputAudioFormats: RealtimeVoiceAudioFormat[];
  outputAudioFormats: RealtimeVoiceAudioFormat[];
  supportsBrowserSession?: boolean;
  supportsBargeIn?: boolean;
  supportsToolCalls?: boolean;
  supportsVideoFrames?: boolean;
  supportsSessionResumption?: boolean;
};

export type RealtimeVoiceProviderResolveConfigContext = {
  cfg: TalkRuntimeConfig;
  rawConfig: RealtimeVoiceProviderConfig;
};

export type RealtimeVoiceProviderConfiguredContext = {
  cfg?: TalkRuntimeConfig;
  providerConfig: RealtimeVoiceProviderConfig;
};

export type RealtimeVoiceBridgeCreateRequest = RealtimeVoiceBridgeCallbacks & {
  cfg?: TalkRuntimeConfig;
  providerConfig: RealtimeVoiceProviderConfig;
  audioFormat?: RealtimeVoiceAudioFormat;
  instructions?: string;
  autoRespondToAudio?: boolean;
  interruptResponseOnInputAudio?: boolean;
  tools?: RealtimeVoiceTool[];
};

export type RealtimeVoiceBargeInOptions = {
  /**
   * The caller has already confirmed assistant audio is still playing in its output sink.
   * This lets providers interrupt output even when the sink cannot provide real playback marks.
   */
  audioPlaybackActive?: boolean;
  /** Interrupt even when normal barge-in audio-duration guards would treat the event as echo. */
  force?: boolean;
};

export type RealtimeVoiceBridge = {
  supportsToolResultContinuation?: boolean;
  connect(): Promise<void>;
  sendAudio(audio: Buffer): void;
  setMediaTimestamp(ts: number): void;
  sendUserMessage?(text: string): void;
  triggerGreeting?(instructions?: string): void;
  handleBargeIn?(options?: RealtimeVoiceBargeInOptions): void;
  submitToolResult(callId: string, result: unknown, options?: RealtimeVoiceToolResultOptions): void;
  acknowledgeMark(): void;
  close(): void;
  isConnected(): boolean;
};

/**
 * Realtime voice provider plugin contract.
 * 自包含版本，替代 openclaw 的 RealtimeVoiceProviderPlugin（来自 plugins/types.js）。
 */
export type RealtimeVoiceProviderPlugin = {
  id: RealtimeVoiceProviderId;
  label?: string;
  aliases?: string[];
  /** Lower autoSelectOrder wins when auto-selecting the first configured provider. */
  autoSelectOrder?: number;
  capabilities?: RealtimeVoiceProviderCapabilities;
  isConfigured(params: RealtimeVoiceProviderConfiguredContext): boolean;
  resolveConfig?(params: RealtimeVoiceProviderResolveConfigContext): RealtimeVoiceProviderConfig;
  createBridge(request: RealtimeVoiceBridgeCreateRequest): RealtimeVoiceBridge;
};

// ============================================================================
// 国内语音服务 Provider 标识（阿里云 / 腾讯云 / 讯飞语音）
// ============================================================================

/** 国内支持的实时语音 provider 标识集合。 */
export const DOMESTIC_REALTIME_VOICE_PROVIDER_IDS = [
  "aliyun",
  "tencent",
  "xfyun",
] as const;

/** 国内实时语音 provider 标识。 */
export type DomesticRealtimeVoiceProviderId =
  (typeof DOMESTIC_REALTIME_VOICE_PROVIDER_IDS)[number];

/** 国内 provider 的友好别名映射，便于配置与显示。 */
export const DOMESTIC_REALTIME_VOICE_PROVIDER_ALIASES: Record<
  DomesticRealtimeVoiceProviderId,
  string[]
> = {
  aliyun: ["aliyun-voice", "alicloud", "aliyun-nls", "阿里云"],
  tencent: ["tencent-voice", "tencent-cloud", "腾讯云"],
  xfyun: ["xfyun-voice", "iflytek", "iat", "讯飞", "讯飞语音"],
};

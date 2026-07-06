/**
 * Talk (语音对话) 类型定义
 * 镜像后端 server/config/talk.ts 的类型
 */

/** Talk provider 配置 */
export interface TalkProviderConfig {
  voiceId?: string;
  voiceAliases?: string[];
  modelId?: string;
  outputFormat?: string;
  apiKey?: string | { ref?: string; env?: string };
  [key: string]: unknown;
}

/** Talk realtime 配置 */
export interface TalkRealtimeConfig {
  provider?: string;
  providers?: Record<string, TalkProviderConfig>;
  model?: string;
  voice?: string;
  speakerVoice?: string;
  speakerVoiceId?: string;
  instructions?: string;
  mode?: 'realtime' | 'stt-tts' | 'transcription';
  transport?: 'webrtc' | 'provider-websocket' | 'gateway-relay' | 'managed-room';
  brain?: 'agent-consult' | 'direct-tools' | 'none';
  consultRouting?: 'provider-direct' | 'force-agent-consult';
}

/** Talk 配置节 */
export interface TalkConfig {
  speechLocale?: string;
  interruptOnSpeech?: boolean;
  consultThinkingLevel?: string;
  consultFastMode?: boolean;
  silenceTimeoutMs?: number;
  provider?: string;
  providers?: Record<string, TalkProviderConfig>;
  realtime?: TalkRealtimeConfig;
}

/** Talk 配置响应 */
export interface TalkConfigResponse {
  interruptOnSpeech?: boolean;
  silenceTimeoutMs?: number;
  consultThinkingLevel?: string;
  consultFastMode?: boolean;
  speechLocale?: string;
  providers?: Record<string, TalkProviderConfig>;
  realtime?: TalkRealtimeConfig;
  provider?: string;
  resolved?: { provider: string; config: TalkProviderConfig };
}

/** 平台默认值 */
export interface TalkDefaults {
  defaults: {
    defaultProvider: string;
    silenceTimeoutMs: number;
    speechLocale: string;
    interruptOnSpeech: boolean;
    consultThinkingLevel: string;
    consultFastMode: boolean;
    realtimeMode: string;
    transport: string;
    brain: string;
    consultRouting: string;
  };
  silenceTimeoutDescription: string;
}

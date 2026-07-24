/**
 * realtime-transcription — 已由 talk/ 模块覆盖。
 *
 * openclaw/src/realtime-transcription/ 提供实时语音转写 provider 类型、注册表与
 * WebSocket 会话实现。cross-wms 的 server/engine/talk/ 模块已提供等效且更完整的
 * 实时语音能力，无需单独移植。
 *
 * 能力映射：
 *   - RealtimeTranscriptionSession (connect/sendAudio/close/isConnected)
 *       → talk/ RealtimeVoiceBridge（超集，额外支持 setMediaTimestamp / sendUserMessage /
 *         triggerGreeting / handleBargeIn / submitToolResult / acknowledgeMark）
 *   - RealtimeTranscriptionSessionCallbacks (onPartial/onTranscript/onSpeechStart/onError)
 *       → talk/ RealtimeVoiceBridgeCallbacks.onTranscript(role, text, isFinal) + onError + onClose
 *   - RealtimeTranscriptionProviderPlugin / provider-registry
 *       → talk/ RealtimeVoiceProviderPlugin + provider-registry.ts（含国内 provider 别名）
 *   - websocket-session (WebSocket 会话 + 重连 + 音频队列)
 *       → talk/ session-runtime.ts + audio-codec.ts（含 PCM 重采样 / G.711 转换）
 *
 * 如需使用实时转写能力，请直接从 talk/ 导入：
 *   import { RealtimeVoiceBridge, RealtimeVoiceProviderPlugin } from "../talk/index.js";
 */

export {
  type RealtimeVoiceBridge as RealtimeTranscriptionSession,
  type RealtimeVoiceBridgeCallbacks as RealtimeTranscriptionSessionCallbacks,
  type RealtimeVoiceProviderPlugin as RealtimeTranscriptionProviderPlugin,
  type RealtimeVoiceProviderId as RealtimeTranscriptionProviderId,
  type TalkRuntimeConfig as RealtimeTranscriptionConfig,
  normalizeRealtimeVoiceProviderId as normalizeRealtimeTranscriptionProviderId,
  listRealtimeVoiceProviders as listRealtimeTranscriptionProviders,
  getRealtimeVoiceProvider as getRealtimeTranscriptionProvider,
  canonicalizeRealtimeVoiceProviderId as canonicalizeRealtimeTranscriptionProviderId,
} from "../talk/index.js";

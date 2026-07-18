/**
 * Talk 语音对话系统公共类型聚合。
 *
 * 自包含实现，统一导出核心类型供路由、网关与 SDK 消费者使用。
 * 各子模块仍保留自身类型定义，本文件仅做聚合与补充会话级类型。
 */

// 事件系统类型
export type {
  TalkEvent,
  TalkEventContext,
  TalkEventInput,
  TalkEventSequencer,
  TalkEventType,
  TalkMode,
  TalkTransport,
  TalkBrain,
} from "./talk-events.js";

// Provider 类型
export type {
  TalkRuntimeConfig,
  RealtimeVoiceProviderId,
  RealtimeVoiceRole,
  RealtimeVoiceCloseReason,
  RealtimeVoiceAudioFormat,
  RealtimeVoiceTool,
  RealtimeVoiceToolCallEvent,
  RealtimeVoiceToolResultOptions,
  RealtimeVoiceBridgeEvent,
  RealtimeVoiceBridgeCallbacks,
  RealtimeVoiceProviderConfig,
  RealtimeVoiceProviderCapabilities,
  RealtimeVoiceProviderResolveConfigContext,
  RealtimeVoiceProviderConfiguredContext,
  RealtimeVoiceBridgeCreateRequest,
  RealtimeVoiceBargeInOptions,
  RealtimeVoiceBridge,
  RealtimeVoiceProviderPlugin,
  DomesticRealtimeVoiceProviderId,
} from "./provider-types.js";

export { TALK_EVENT_TYPES } from "./talk-events.js";

export {
  REALTIME_VOICE_AUDIO_FORMAT_G711_ULAW_8KHZ,
  REALTIME_VOICE_AUDIO_FORMAT_PCM16_24KHZ,
  DOMESTIC_REALTIME_VOICE_PROVIDER_IDS,
  DOMESTIC_REALTIME_VOICE_PROVIDER_ALIASES,
} from "./provider-types.js";

// 激活词类型
export type {
  RealtimeVoiceActivationNameEdge,
  RealtimeVoiceActivationNameMatchKind,
  RealtimeVoiceActivationNameTranscriptResult,
} from "./activation-name.js";

// 会话运行时类型
export type {
  RealtimeVoiceAudioSink,
  RealtimeVoiceMarkStrategy,
  RealtimeVoiceBridgeSession,
  RealtimeVoiceBridgeSessionParams,
} from "./session-runtime.js";

// 会话控制器类型
export type {
  TalkTurnFailureReason,
  TalkTurnSuccess,
  TalkTurnFailure,
  TalkTurnResult,
  TalkEnsureTurnResult,
  TalkSessionController,
  TalkSessionControllerParams,
  TalkSessionControllerOptions,
} from "./talk-session-controller.js";

// 输出活动追踪器类型
export type {
  RealtimeVoiceOutputActivityTrackerOptions,
  RealtimeVoiceOutputActivityDelta,
  RealtimeVoiceOutputActivitySnapshot,
  RealtimeVoiceOutputActivityTracker,
} from "./output-activity-tracker.js";

// 轮次上下文追踪器类型
export type {
  RealtimeVoiceTurnContextTrackerOptions,
  RealtimeVoiceTurnContextHandle,
  RealtimeVoiceTurnContextTracker,
} from "./turn-context-tracker.js";

// 咨询问题类型
export type {
  RealtimeVoiceConsultQuestionMatchOptions,
  RealtimeVoiceSpeakableToolResultOptions,
} from "./consult-question.js";

// 咨询转录类型
export type {
  SkippableRealtimeVoiceConsultTranscriptReason,
} from "./consult-transcript.js";

// 强制咨询协调器类型
export type {
  RealtimeVoiceForcedConsultTimer,
  RealtimeVoiceForcedConsultCoordinatorOptions,
  RealtimeVoiceForcedConsultHandle,
  RealtimeVoiceForcedConsultNativeMatch,
  RealtimeVoiceForcedConsultNativeRecentOptions,
  RealtimeVoiceForcedConsultCoordinator,
} from "./forced-consult-coordinator.js";

// 代理咨询工具类型
export type {
  RealtimeVoiceAgentConsultToolPolicy,
  RealtimeVoiceAgentConsultArgs,
  RealtimeVoiceAgentConsultTranscriptEntry,
} from "./agent-consult-tool.js";

// 代理咨询运行时类型
export type {
  RealtimeVoiceAgentConsultRuntime,
  RealtimeVoiceAgentConsultResult,
  RealtimeVoiceAgentConsultContextMode,
} from "./agent-consult-runtime.js";

// 代理回话运行时类型
export type {
  RealtimeVoiceAgentTalkbackResult,
  RealtimeVoiceAgentTalkbackQueue,
  RealtimeVoiceAgentTalkbackQueueParams,
} from "./agent-talkback-runtime.js";

// 代理运行控制类型
export type {
  RealtimeVoiceAgentControlMode,
  RealtimeVoiceAgentControlIntent,
  RealtimeVoiceAgentControlProviderResult,
  RealtimeVoiceAgentRunActivity,
  RealtimeVoiceAgentControlResult,
} from "./agent-run-control.js";

// 快速上下文运行时类型
export type {
  RealtimeVoiceFastContextConfig,
  RealtimeVoiceFastContextLabels,
  RealtimeVoiceFastContextConsultResult,
} from "./fast-context-runtime.js";

// 会话日志运行时类型
export type {
  RealtimeVoiceTranscriptEntry,
  RealtimeVoiceTranscriptHealth,
  RealtimeVoiceBridgeEventLogEntry,
  RealtimeVoiceBridgeEventHealth,
} from "./session-log-runtime.js";

import type { TalkEventContext } from "./talk-events.js";
import type { RealtimeVoiceProviderId } from "./provider-types.js";

/**
 * 会话级聚合类型：描述一个 Talk 语音会话的核心标识与上下文。
 */
export interface TalkSession {
  /** 会话唯一标识。 */
  sessionId: string;
  /** 会话关联的 agent 标识。 */
  agentId?: string;
  /** 会话关联的 store 路径。 */
  storePath?: string;
  /** 当前活动 provider 标识。 */
  provider?: RealtimeVoiceProviderId;
  /** 会话事件上下文（用于事件序列化）。 */
  context: TalkEventContext;
  /** 会话创建时间（ISO 字符串）。 */
  createdAt: string;
  /** 会话是否已关闭。 */
  closed: boolean;
}

/**
 * 激活词（唤醒词）聚合类型，兼容历史命名 ActivationName。
 */
export type ActivationName = string;

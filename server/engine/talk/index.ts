/**
 * Talk 语音对话系统统一导出。
 *
 * 聚合所有子模块的公共 API、类型与常量，便于路由、网关与 SDK 消费者统一导入。
 * 自包含实现，不依赖 openclaw 外部模块。
 */

// ============================================================================
// 事件系统
// ============================================================================
export {
  createTalkEventSequencer,
  TALK_EVENT_TYPES,
} from "./talk-events.js";
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

// ============================================================================
// Provider 类型与常量
// ============================================================================
export {
  REALTIME_VOICE_AUDIO_FORMAT_G711_ULAW_8KHZ,
  REALTIME_VOICE_AUDIO_FORMAT_PCM16_24KHZ,
  DOMESTIC_REALTIME_VOICE_PROVIDER_IDS,
  DOMESTIC_REALTIME_VOICE_PROVIDER_ALIASES,
} from "./provider-types.js";
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

// ============================================================================
// 事件指标
// ============================================================================
export {
  asOptionalRecord,
  firstFiniteTalkEventNumber,
} from "./event-metrics.js";

// ============================================================================
// 激活词匹配
// ============================================================================
export {
  REALTIME_VOICE_ACTIVATION_NAME_MAX_WORDS,
  realtimeVoiceActivationNameWordCount,
  normalizeRealtimeVoiceActivationName,
  normalizeRealtimeVoiceActivationNamePrefix,
  isSupportedRealtimeVoiceActivationName,
  normalizeSupportedRealtimeVoiceActivationName,
  sortRealtimeVoiceActivationNames,
  matchRealtimeVoiceActivationName,
} from "./activation-name.js";
export type {
  RealtimeVoiceActivationNameEdge,
  RealtimeVoiceActivationNameMatchKind,
  RealtimeVoiceActivationNameTranscriptResult,
} from "./activation-name.js";

// ============================================================================
// 音频编解码
// ============================================================================
export {
  resamplePcm,
  resamplePcmTo8k,
  pcmToMulaw,
  mulawToPcm,
  convertPcmToMulaw8k,
  detectPcmSilence,
} from "./audio-codec.js";
export type {
  SilenceDetectionOptions,
  SilenceDetectionResult,
} from "./audio-codec.js";

// ============================================================================
// 输出活动追踪器
// ============================================================================
export {
  createRealtimeVoiceOutputActivityTracker,
} from "./output-activity-tracker.js";
export type {
  RealtimeVoiceOutputActivityTrackerOptions,
  RealtimeVoiceOutputActivityDelta,
  RealtimeVoiceOutputActivitySnapshot,
  RealtimeVoiceOutputActivityTracker,
} from "./output-activity-tracker.js";

// ============================================================================
// 轮次上下文追踪器
// ============================================================================
export {
  createRealtimeVoiceTurnContextTracker,
} from "./turn-context-tracker.js";
export type {
  RealtimeVoiceTurnContextTrackerOptions,
  RealtimeVoiceTurnContextHandle,
  RealtimeVoiceTurnContextTracker,
} from "./turn-context-tracker.js";

// ============================================================================
// 咨询问题
// ============================================================================
export {
  readRealtimeVoiceConsultQuestion,
  normalizeRealtimeVoiceConsultQuestion,
  matchRealtimeVoiceConsultQuestions,
  readSpeakableRealtimeVoiceToolResult,
} from "./consult-question.js";
export type {
  RealtimeVoiceConsultQuestionMatchOptions,
  RealtimeVoiceSpeakableToolResultOptions,
} from "./consult-question.js";

// ============================================================================
// 咨询转录
// ============================================================================
export {
  classifySkippableRealtimeVoiceConsultTranscript,
} from "./consult-transcript.js";
export type {
  SkippableRealtimeVoiceConsultTranscriptReason,
} from "./consult-transcript.js";

// ============================================================================
// 会话控制器
// ============================================================================
export {
  createTalkSessionController,
  normalizeTalkTransport,
} from "./talk-session-controller.js";
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

// ============================================================================
// Provider 注册表
// ============================================================================
export {
  normalizeRealtimeVoiceProviderId,
  canonicalizeDomesticProviderAlias,
  registerRealtimeVoiceProvider,
  unregisterRealtimeVoiceProvider,
  clearRealtimeVoiceProviderRegistry,
  listRealtimeVoiceProviders,
  getRealtimeVoiceProvider,
  canonicalizeRealtimeVoiceProviderId,
} from "./provider-registry.js";

// ============================================================================
// Provider 解析器
// ============================================================================
export {
  resolveConfiguredRealtimeVoiceProvider,
} from "./provider-resolver.js";
export type {
  ResolvedRealtimeVoiceProvider,
  ResolveConfiguredRealtimeVoiceProviderParams,
} from "./provider-resolver.js";

// ============================================================================
// 会话运行时
// ============================================================================
export {
  createRealtimeVoiceBridgeSession,
} from "./session-runtime.js";
export type {
  RealtimeVoiceAudioSink,
  RealtimeVoiceMarkStrategy,
  RealtimeVoiceBridgeSession,
  RealtimeVoiceBridgeSessionParams,
} from "./session-runtime.js";

// ============================================================================
// 诊断事件
// ============================================================================
export {
  subscribeTalkDiagnosticEvents,
  clearTalkDiagnosticEventListeners,
  emitTrustedDiagnosticEvent,
  createTalkDiagnosticEvent,
  recordTalkDiagnosticEvent,
} from "./diagnostics.js";
export type { TalkDiagnosticEventInput } from "./diagnostics.js";

// ============================================================================
// 日志
// ============================================================================
export {
  createTalkLogRecord,
  recordTalkLogEvent,
} from "./logging.js";

// ============================================================================
// 可观测性
// ============================================================================
export { recordTalkObservabilityEvent } from "./observability.js";

// ============================================================================
// 会话日志运行时
// ============================================================================
export {
  recordRealtimeVoiceTranscript,
  getRealtimeVoiceTranscriptHealth,
  recordRealtimeVoiceBridgeEvent,
  getRealtimeVoiceBridgeEventHealth,
  isLikelyRealtimeVoiceAssistantEchoTranscript,
  extendRealtimeVoiceOutputEchoSuppression,
} from "./session-log-runtime.js";
export type {
  RealtimeVoiceTranscriptEntry,
  RealtimeVoiceTranscriptHealth,
  RealtimeVoiceBridgeEventLogEntry,
  RealtimeVoiceBridgeEventHealth,
} from "./session-log-runtime.js";

// ============================================================================
// 强制咨询协调器
// ============================================================================
export {
  createRealtimeVoiceForcedConsultCoordinator,
} from "./forced-consult-coordinator.js";
export type {
  RealtimeVoiceForcedConsultTimer,
  RealtimeVoiceForcedConsultCoordinatorOptions,
  RealtimeVoiceForcedConsultHandle,
  RealtimeVoiceForcedConsultNativeMatch,
  RealtimeVoiceForcedConsultNativeRecentOptions,
  RealtimeVoiceForcedConsultCoordinator,
} from "./forced-consult-coordinator.js";

// ============================================================================
// 代理咨询工具
// ============================================================================
export {
  REALTIME_VOICE_AGENT_CONSULT_TOOL_NAME,
  REALTIME_VOICE_AGENT_CONSULT_TOOL_POLICIES,
  REALTIME_VOICE_AGENT_CONSULT_TOOL,
  buildRealtimeVoiceAgentConsultWorkingResponse,
  isRealtimeVoiceAgentConsultToolPolicy,
  resolveRealtimeVoiceAgentConsultToolPolicy,
  resolveRealtimeVoiceAgentConsultTools,
  resolveRealtimeVoiceAgentConsultToolsAllow,
  buildRealtimeVoiceAgentConsultPolicyInstructions,
  parseRealtimeVoiceAgentConsultArgs,
  buildRealtimeVoiceAgentConsultChatMessage,
  buildRealtimeVoiceAgentConsultPrompt,
  collectRealtimeVoiceAgentConsultVisibleText,
} from "./agent-consult-tool.js";
export type {
  RealtimeVoiceAgentConsultToolPolicy,
  RealtimeVoiceAgentConsultArgs,
  RealtimeVoiceAgentConsultTranscriptEntry,
} from "./agent-consult-tool.js";

// ============================================================================
// 代理咨询运行时
// ============================================================================
export { consultRealtimeVoiceAgent } from "./agent-consult-runtime.js";
export type {
  RealtimeVoiceAgentConsultRuntime,
  RealtimeVoiceAgentConsultRunParams,
  RealtimeVoiceAgentConsultRunPayload,
  RealtimeVoiceAgentConsultRunResult,
  RealtimeVoiceAgentConsultResult,
  RealtimeVoiceAgentConsultContextMode,
} from "./agent-consult-runtime.js";

// ============================================================================
// 代理回话运行时
// ============================================================================
export {
  createRealtimeVoiceAgentTalkbackQueue,
} from "./agent-talkback-runtime.js";
export type {
  RealtimeVoiceAgentTalkbackResult,
  RealtimeVoiceAgentTalkbackQueue,
  RealtimeVoiceAgentTalkbackQueueParams,
  RuntimeLogger,
} from "./agent-talkback-runtime.js";

// ============================================================================
// 代理运行控制
// ============================================================================
export {
  REALTIME_VOICE_AGENT_CONTROL_MODES,
  REALTIME_VOICE_AGENT_CONTROL_TOOL_NAME,
  REALTIME_VOICE_AGENT_CONTROL_TOOL,
  normalizeRealtimeVoiceAgentControlMode,
  resolveRealtimeVoiceAgentControlIntent,
  classifyRealtimeVoiceAgentControlText,
  shouldAutoControlRealtimeVoiceAgentText,
  parseRealtimeVoiceAgentControlToolArgs,
  buildRealtimeVoiceAgentControlSpeechMessage,
  buildRealtimeVoiceAgentCancelProviderResult,
  buildRealtimeVoiceAgentFollowupSteeringText,
  formatRealtimeVoiceAgentQueueRejection,
  formatRealtimeVoiceAgentStatus,
  controlRealtimeVoiceAgentRun,
} from "./agent-run-control.js";
export type {
  RealtimeVoiceAgentControlMode,
  RealtimeVoiceAgentControlProviderResult,
  RealtimeVoiceAgentControlIntent,
  RealtimeVoiceAgentRunActivity,
  RealtimeVoiceAgentControlResult,
  EmbeddedAgentQueueMessageOutcome,
  RealtimeVoiceAgentControlDeps,
} from "./agent-run-control.js";

// ============================================================================
// 快速上下文运行时
// ============================================================================
export {
  resolveRealtimeVoiceFastContextConsult,
} from "./fast-context-runtime.js";
export type {
  RealtimeVoiceFastContextConfig,
  RealtimeVoiceFastContextLabels,
  RealtimeVoiceFastContextConsultResult,
  RealtimeVoiceFastContextSearchManager,
  ResolvedFastContextSearchManager,
} from "./fast-context-runtime.js";

// ============================================================================
// 会话级聚合类型
// ============================================================================
export type { TalkSession, ActivationName } from "./types.js";

// ============================================================================
// 配置层（engine 层调用 config 层）
// 封装 config/talk.js 的 Talk 配置读写，供路由层统一通过 engine/talk/ 调用。
// engine/talk/ 聚焦实时语音会话运行时，配置规范化由 config/talk.js 提供。
// ============================================================================
export {
  TALK_CONFIG_DEFAULTS,
  describeTalkSilenceTimeoutDefaults,
  resolveTalkConfig,
  buildTalkConfigResponse,
  normalizeTalkSection,
} from "../../config/talk.js";
export type { TalkConfig } from "../../config/talk.js";

export {
  ChannelManager,
  getChannelManager,
  resetChannelManager,
} from '../channelSystem.js';

export type {
  ChannelType,
  ChannelStatus,
  ChannelConfig as ChannelSystemConfig,
  ChannelMessage as ChannelSystemMessage,
  ChannelAdapter,
  ChannelAccount as ChannelSystemAccount,
} from '../channelSystem.js';

export {
  WebhookChannelAdapter,
  FeishuChannelAdapter,
  DingtalkChannelAdapter,
  WechatWorkChannelAdapter,
  WechatPersonalChannelAdapter,
  EmailChannelAdapter,
} from '../channelSystem.js';

export {
  InboundPipeline,
  RateLimitStep,
  ContentFilterStep,
} from '../channelSystem.js';

export {
  startChannelHealthMonitor,
  stopChannelHealthMonitor,
  getChannelHealth,
  listChannelHealth,
  registerChannel as registerChannelHealthEvent,
  unregisterChannel as unregisterChannelHealthEvent,
  recordChannelEvent,
} from '../channelHealthMonitor.js';

export type {
  ChannelHealthInfo,
  ChannelHealthMonitorDeps,
  ChannelHealthMonitor,
} from '../channelHealthMonitor.js';

export { sendTypingIndicator, stopTypingIndicator } from './typing.js';
export type { TypingIndicatorOptions } from './typing.js';

export { parseTarget, resolveTarget, validateTarget } from './targets.js';
export type { ChannelTarget, TargetResolutionResult } from './targets.js';

export { createChannelSession, getChannelSession, closeChannelSession } from './session.js';
export type { ChannelSession } from './session.js';

export { logChannelMessage, formatChannelLog } from './logging.js';

export {
  getConnection,
  setConnectionState,
  listConnections,
  getActiveConnections,
  getFailedConnections,
  clearConnection,
} from './connection.js';
export type { ChannelConnection, ChannelConnectionState } from './connection.js';

export {
  configureRateLimit,
  checkRateLimit,
  resetRateLimit,
  listRateLimits,
} from './rate-limit.js';
export type { ChannelRateLimit } from './rate-limit.js';

export {
  addRoute,
  removeRoute,
  matchRoute,
  listRoutes,
  clearRoutes,
} from './routing.js';
export type { ChannelMessageRoute } from './routing.js';

export * from './message/index.js';

// 频道入站/消息访问图（移植自 openclaw channels/message-access/）
// 注意：仅含低依赖的类型与白名单诊断；decision/runtime/state 等运行时
// 解析器依赖 cross-wms 中实现不同的 command-gating/allow-from/pairing-store，暂未移植。
export * from './message-access/index.js';

export * from './turn/index.js';

export * from './plugins/index.js';

export * from './inbound-event/index.js';

export {
  registerChannel,
  unregisterChannel,
  getChannel,
  getChannelOrThrow,
  hasChannel,
  listChannels,
  listEnabledChannels,
  getChannelMeta,
  getChannelCapabilities,
  findChannelByAlias,
  clearRegistry,
  getRegistryCount,
} from './registry.js';

export { ChannelConfigSchema, getChannelConfig, isChannelEnabled, getChannelAccountIds, getChannelAccountConfig, getDefaultAccountId, validateChannelConfig, setChannelConfig, mergeChannelConfig, clearConfigCache } from './channel-config.js';
export type { ChannelConfig } from './channel-config.js';

export {
  createSessionMeta,
  getSessionMeta,
  updateSessionMeta,
  incrementMessageCount as incrementSessionMessageCount,
  incrementTurnCount,
  addSessionTag,
  removeSessionTag,
  hasSessionTag,
  setSessionData,
  getSessionData,
  deleteSessionMeta,
  listSessionMetas,
  clearSessionMetaStore,
  getSessionDuration,
} from './session-meta.js';
export type { SessionMeta } from './session-meta.js';

export type { SessionStatus, SessionCreateOptions, SessionUpdateOptions } from './session.types.js';

export { configureAllowFrom, getAllowFromConfig, checkAllowFrom, allowFromDM, allowFromGroup, isUserBlocked, isUserAllowed, removeAllowFromConfig, clearAllowFromConfigs } from './allow-from.js';
export type { AllowFromSource, AllowFromConfig } from './allow-from.js';

export { setChannelAllowlist, getChannelAllowlist, addAllowlistEntry, removeAllowlistEntry, matchAllowlist, enableAllowlist, setDefaultAllow, clearAllowlist, clearAllAllowlists } from './allowlist-match.js';
export type { AllowlistEntryType, AllowlistEntry, ChannelAllowlist } from './allowlist-match.js';

export { configureMentionGating, getMentionGatingConfig, parseMentions, isBotMentioned, shouldProcessMessage, stripBotMention, hasEveryoneMention, hasHereMention, clearMentionGatingConfig } from './mention-gating.js';
export type { MentionType, MentionInfo, MentionGatingConfig } from './mention-gating.js';

export { configureDirectDm, getDirectDmConfig, isDirectDmEnabled, canInitiateDm, trackDmSession, getDmSession, updateDmActivity, getActiveDmSessions, isDmTarget, removeDmSession, clearDmSessions, getDmStats } from './direct-dm.js';
export type { DirectDmConfig } from './direct-dm.js';

export { configureStreaming, getStreamingConfig, isStreamingEnabled, startStreamingSession, pushStreamingToken, pushStreamingDelta, endStreamingSession, failStreamingSession, getStreamingSession, getActiveStreamingSessions, clearStreamingSessions } from './streaming.js';
export type { StreamingEventType, StreamingEvent, StreamingSession, StreamingConfig } from './streaming.js';

export { bindThread, unbindThread, getThreadBinding, findThreadByConversation, findThreadByExternalId, getOrCreateThreadBinding, updateThreadBinding, listThreadBindings, clearThreadBindings } from './thread-bindings.js';
export type { ThreadBinding } from './thread-bindings.js';

export { resolveConversation, createConversation, getConversation, updateConversation, incrementMessageCount, addParticipant, removeParticipant, listConversations, deleteConversation, clearConversations, getConversationStats } from './conversation-resolution.js';
export type { ConversationInfo, ConversationResolutionResult } from './conversation-resolution.js';

export { configureAckReactions, getAckReactionConfig, areAckReactionsEnabled, getAckEmoji, setAckReactionHandler, sendAckReaction, removeAckReactionConfig, clearAckReactionConfigs } from './ack-reactions.js';
export type { AckType, AckReactionConfig, AckReactionHandler } from './ack-reactions.js';

export { configureStatusReactions, getStatusReactionConfig, areStatusReactionsEnabled, getStatusEmoji, setStatusHandler, sendStatusUpdate, removeStatusReactionConfig, clearStatusReactionConfigs } from './status-reactions.js';
export type { StatusType, StatusReactionConfig, StatusHandler } from './status-reactions.js';

export { configureCommandGating, getCommandGatingConfig, isCommand, extractCommandName, canExecuteCommand, addAllowedCommand, addBlockedCommand, addAdminUser, isAdminUser, removeCommandGatingConfig, clearCommandGatingConfigs } from './command-gating.js';
export type { CommandScope, CommandGatingConfig } from './command-gating.js';

export { setChannelModelOverrides, getChannelModelOverrides, getEffectiveModelParams, applyModelOverride, enableModelOverrides, updateModelOverride, removeModelOverrides, clearAllModelOverrides, mergeModelOverrides } from './model-overrides.js';
export type { ModelOverrides, ChannelModelOverride } from './model-overrides.js';

export { configureReplyPrefix, getReplyPrefixConfig, isReplyPrefixEnabled, applyReplyPrefix, stripReplyPrefix, setReplyPrefix, setReplySuffix, removeReplyPrefixConfig, clearReplyPrefixConfigs } from './reply-prefix.js';
export type { ReplyPrefixConfig } from './reply-prefix.js';

export { cacheChannelLocation, getChannelLocation, resolveLocation, getLocationDisplayName, isPublicChannel, isPrivateChannel, isArchivedChannel, listCachedLocations, clearLocationCache } from './location.js';
export type { ChannelLocation, LocationResolutionResult } from './location.js';

export { generateId, generateMessageId, generateConversationId, generateSessionId, generateThreadId, generateEventId, generateTurnId, generateDeliveryId, generatePairingId, generateWizardId, generateStreamId, getIdTimestamp, getIdType, isValidId } from './ids.js';
export type { IdType } from './ids.js';

export { createRunStateMachine, getRunStateMachine, transitionState, canTransition, addStateListener, getState, isRunning, isStopped, isInError, removeStateMachine, clearStateMachines, getValidTransitions } from './run-state-machine.js';
export type { RunState, StateMachineTransition, RunStateMachine } from './run-state-machine.js';

export { createSenderLabel, getSenderLabel, getOrCreateSenderLabel, updateSenderLabel, addSenderTag, removeSenderTag, formatSenderName, isBotSender, isAdminSender, isModeratorSender, listSenderLabels, clearSenderLabels, getSenderLabelKey } from './sender-label.js';
export type { SenderLabelType, SenderLabel } from './sender-label.js';

export * from './channel-plugins/index.js';

export * from './channel-transport/index.js';

export * from './channel-providers/index.js';

export {
  MessageValidationSchema,
  validateMessageContent,
  validateMessageId,
  validateChannelId,
  type ValidationResult,
} from './channel-message/message-validator.js';

export {
  transformMessage,
  normalizeText,
  markdownToText,
  enrichMetadata,
  convertMessageParts,
  mergeMessageParts,
  type TransformOptions,
  type TransformResult,
} from './channel-message/message-transformer.js';

export {
  routeMessage,
  type RouteCondition,
  type MessageRoute,
} from './channel-message/message-router.js';

export {
  MessageQueue,
  type QueuePriority,
  type QueueOptions,
} from './channel-message/message-queue.js';

export {
  determinePriority,
  calculateDefaultPriority,
  comparePriority,
  isHigherPriority,
  isLowerPriority,
  getPriorityLabel,
  getPriorityColor,
  addPriorityRule,
  removePriorityRule,
  listPriorityRules,
  clearPriorityRules,
  type MessagePriority,
} from './channel-message/message-priority.js';

export * from './channel-session/index.js';

// 消息通道与交付上下文 — 用于规范化通道路由
export {
  INTERNAL_MESSAGE_CHANNEL,
  BUILT_IN_CHANNEL_IDS,
  NATIVE_APPROVAL_CHANNELS,
  normalizeMessageChannel,
  isDeliverableMessageChannel,
  isInternalMessageChannel,
  isInternalNonDeliveryChannel,
  isNativeApprovalChannel,
  isMarkdownCapableMessageChannel,
  resolveMessageChannel,
  type InternalMessageChannel,
  type NativeApprovalChannel,
} from './message-channel.js';

export {
  normalizeDeliveryContext,
  mergeDeliveryContext,
  deliveryContextKey,
  deliveryContextFromSession,
  normalizeSessionDeliveryFields,
  type DeliveryContext,
  type DeliveryContextSessionSource,
} from './delivery-context.js';

// 会话目标参数规范化
export {
  normalizeConversationTargetParams,
  type ConversationTargetParams,
} from './conversation-target.js';

// Default account 警告文本（用于 doctor/setup 消息）
export {
  formatChannelAccountsDefaultPath,
  formatSetExplicitDefaultInstruction,
  formatSetExplicitDefaultToConfiguredInstruction,
} from './default-account-warnings.js';

// Channel 会话类型规范化
export { normalizeChatType, type ChatType } from './chat-type.js';

// Thread binding id 解析
export { resolveThreadBindingConversationIdFromBindingId } from './thread-binding-id.js';

// Native 命令会话目标解析
export {
  resolveNativeCommandSessionTargets,
  type ResolveNativeCommandSessionTargetsParams,
} from './native-command-session-targets.js';

// Direct-DM 预解密守卫策略
export {
  createDirectDmPreCryptoGuardPolicy,
  type DirectDmPreCryptoGuardPolicy,
  type DirectDmPreCryptoGuardPolicyOverrides,
} from './direct-dm-guard-policy.js';

// 节流草稿流循环
export {
  createDraftStreamLoop,
  type DraftStreamLoop,
} from './draft-stream-loop.js';

// 可终结的草稿流控制
export {
  createFinalizableDraftStreamControls,
  createFinalizableDraftStreamControlsForState,
  takeMessageIdAfterStop,
  clearFinalizableDraftMessage,
  createFinalizableDraftLifecycle,
  type FinalizableDraftStreamState,
} from './draft-stream-controls.js';

// Chat 目标前缀解析
export {
  isAllowedParsedChatSender,
  resolveServicePrefixedTarget,
  resolveServicePrefixedChatTarget,
  parseChatTargetPrefixesOrThrow,
  resolveServicePrefixedAllowTarget,
  resolveServicePrefixedOrChatAllowTarget,
  createAllowedChatSenderMatcher,
  parseChatAllowTargetPrefixes,
  type ServicePrefix,
  type ChatTargetPrefixesParams,
  type ParsedChatTarget,
  type ParsedChatAllowTarget,
  type ChatSenderAllowParams,
} from './chat-target-prefixes.js';

// 频道传输层
export * from './transport/index.js';

// 进度草稿行移除辅助（移植自 openclaw channels/progress-draft-lines）
export {
  removeChannelProgressDraftLine,
  type ChannelProgressDraftLine,
} from './progress-draft-lines.js';

// Typing-start 电路断路器（移植自 openclaw channels/typing-start-guard）
export { createTypingStartGuard } from './typing-start-guard.js';

// Typing 保活循环（移植自 openclaw channels/typing-lifecycle）
export { createTypingKeepaliveLoop } from './typing-lifecycle.js';

// 会话标签解析器（移植自 openclaw channels/conversation-label）
export {
  resolveConversationLabel,
  type MsgContext,
} from './conversation-label.js';

// Thread-binding 消息构建器（移植自 openclaw channels/thread-bindings-messages）
export {
  formatThreadBindingDurationLabel,
  resolveThreadBindingThreadName,
  resolveThreadBindingIntroText,
  resolveThreadBindingFarewellText,
} from './thread-bindings-messages.js';

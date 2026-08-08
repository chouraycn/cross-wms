// 移植自 openclaw/src/channels/plugins/types.core.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ChannelId = unknown;

export type ChannelLegacyStateMigrationPlan = unknown;

export type ChannelExposure = unknown;

export type ChannelOutboundTargetMode = unknown;

export type ChannelAgentTool = unknown;

export type ChannelAgentToolFactory = unknown;

export type ChannelMessageActionDiscoveryContext = unknown;

export type ChannelMessageToolSchemaContribution = unknown;

export type ChannelMessageToolDiscovery = unknown;

export type ChannelSetupInput = unknown;

export type ChannelStatusIssue = unknown;

export type ChannelAccountState = unknown;

export type ChannelHeartbeatDeps = unknown;

export type ChannelMeta = unknown;

export type ChannelAccountSnapshot = unknown;

export type ChannelLogSink = unknown;

export type ChannelGroupContext = unknown;

export type PreferredAudioFileFormat = unknown;

export type ChannelTtsVoiceDeliveryCapabilities = unknown;

export type ChannelCapabilities = unknown;

export type ChannelSecurityDmPolicy = {
  policy: string;
  allowFrom?: Array<string | number> | null;
  policyPath?: string;
  allowFromPath: string;
  approveHint: string;
  normalizeEntry?: (raw: string) => string;
};

export type ChannelSecurityContext = unknown;

export type ChannelMentionAdapter = unknown;

export type ChannelStreamingAdapter = unknown;

export type ChannelStructuredComponents = unknown;

export type ChannelCrossContextPresentationFactory = unknown;

export type ChannelReplyTransport = unknown;

export type ChannelFocusedBindingContext = unknown;

export type ChannelOutboundSessionRoute = {
  baseSessionKey?: string;
  sessionKey?: string;
  threadId?: string | number | null;
  channel?: string;
  accountId?: string;
  peer?: any;
  chatType?: string;
  from?: string;
  to?: string;
  route?: any;
  normalizeThreadId?: (value?: string | number | null) => string | undefined;
  [key: string]: any;
};

export type ChannelThreadingAdapter = {
  matchesToolContextTarget?: (params: any) => boolean;
  resolveReplyToMode?: (params: {
    cfg: any;
    accountId?: string | null;
    chatType?: string | null;
  }) => "off" | "first" | "all" | "batched" | undefined;
  allowExplicitReplyTagsWhenOff?: boolean;
  [key: string]: any;
};

export type ChannelThreadingContext = unknown;

export type ChannelThreadingToolContext = unknown;

export type ChannelMessagingAdapter = {
  resolveOutboundSessionRoute?: (params: any) => ChannelOutboundSessionRoute | Promise<ChannelOutboundSessionRoute>;
  [key: string]: any;
};

export type ChannelAgentPromptAdapter = unknown;

export type ChannelDirectoryEntryKind = unknown;

export type ChannelDirectoryEntry = unknown;

export type ChannelMessageActionName = unknown;

export type ChannelMessageActionContext = unknown;

export type ChannelToolSend = unknown;

export type ChannelMessagePreparedSendPayloadContext = unknown;

export type ChannelMessageActionAdapter = unknown;

export type ChannelPollResult = unknown;

export type ChannelPollContext = unknown;

export type BaseProbeResult = unknown;

export type BaseTokenResolution = unknown;

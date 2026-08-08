// 移植自 openclaw/src/channels/plugins/types.adapters.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ChannelOutboundAdapter = {
  sendText?: (ctx: any) => unknown | Promise<any>;
  sendMedia?: (ctx: any) => unknown | Promise<any>;
  sendPoll?: (ctx: any) => unknown | Promise<any>;
  resolveOutboundSessionRoute?: (params: any) => unknown;
  [key: string]: any;
};

export type ChannelOutboundChunkContext = unknown;

export type ChannelOutboundContext = unknown;

export type ChannelOutboundFormattedContext = unknown;

export type ChannelOutboundPayloadContext = unknown;

export type ChannelOutboundPayloadHint = unknown;

export type ChannelOutboundTargetRef = unknown;

export type ChannelDeliveryCapabilities = unknown;

export type ChannelPairingAdapter = {
  idLabel?: string;
  normalizeAllowEntry?: (entry: string) => string | null | undefined;
  notifyApproval?: (params: any) => void | Promise<void>;
  [key: string]: any;
};

export type ChannelApprovalKind = unknown;

export type ChannelActionAvailabilityState = unknown;

export type ChannelApprovalInitiatingSurfaceState = unknown;

export type ChannelApprovalForwardTarget = unknown;

export type ChannelCapabilitiesDisplayTone = unknown;

export type ChannelCapabilitiesDisplayLine = unknown;

export type ChannelCapabilitiesDiagnostics = unknown;

export type ChannelSetupAdapter = unknown;

export type ChannelConfigAdapter = unknown;

export type ChannelSecretsAdapter = unknown;

export type ChannelGroupAdapter = unknown;

export type ChannelStatusAdapter = unknown;

export type ChannelGatewayContext = unknown;

export type ChannelLogoutResult = unknown;

export type ChannelLoginWithQrStartResult = unknown;

export type ChannelLoginWithQrWaitResult = unknown;

export type ChannelLogoutContext = unknown;

export type ChannelGatewayAdapter = unknown;

export type ChannelAuthAdapter = unknown;

export type ChannelHeartbeatAdapter = unknown;

export type ChannelDirectoryAdapter = unknown;

export type ChannelResolveKind = unknown;

export type ChannelResolveResult = unknown;

export type ChannelResolverAdapter = unknown;

export type ChannelElevatedAdapter = unknown;

export type ChannelCommandAdapter = unknown;

export type ChannelDoctorConfigMutation = unknown;

export type ChannelDoctorLegacyConfigRule = unknown;

export type ChannelDoctorSequenceResult = unknown;

export type ChannelDoctorEmptyAllowlistAccountContext = unknown;

export type ChannelDoctorAdapter = unknown;

export type ChannelLifecycleAdapter = unknown;

export type ChannelApprovalDeliveryAdapter = unknown;

export type ChannelApproveCommandBehavior = unknown;

export type ChannelApprovalNativeAdapter = unknown;

export type ChannelApprovalNativeDeliveryCapabilities = unknown;

export type ChannelApprovalNativeDeliveryPreference = unknown;

export type ChannelApprovalNativeRequest = unknown;

export type ChannelApprovalNativeSurface = unknown;

export type ChannelApprovalNativeTarget = unknown;

export type ChannelApprovalRenderAdapter = unknown;

export type ChannelApprovalAdapter = unknown;

export type ChannelApprovalCapability = unknown;

export type ChannelAllowlistAdapter = unknown;

export type ChannelConfiguredBindingConversationRef = {
  conversationId: string;
  parentConversationId?: string;
};

export type ChannelConfiguredBindingMatch = ChannelConfiguredBindingConversationRef & {
  matchPriority?: number;
};

export type ChannelCommandConversationContext = unknown;

export type ChannelConfiguredBindingProvider = {
  matchInboundConversation: (params: {
    binding: any;
    compiledBinding: ChannelConfiguredBindingConversationRef;
    conversationId: string;
    parentConversationId?: string;
  }) => ChannelConfiguredBindingMatch | null;
};

export type ChannelConversationBindingSupport = unknown;

export type ChannelSecurityAdapter<ResolvedAccount = unknown> = {
  normalizeAllowEntry?: (entry: string) => string | null | undefined;
  notifyApproval?: (params: any) => void | Promise<void>;
  notify?: (params: any) => void | Promise<void>;
  resolveReplyToMode?: (params: {
    cfg: any;
    accountId?: string | null;
    chatType?: string | null;
  }) => "off" | "first" | "all" | "batched" | undefined;
  collectWarnings?: (params: any) => unknown;
  collectAuditFindings?: (params: any) => unknown;
  dm?: {
    channelKey?: string;
    allowFrom?: string[];
    denyFrom?: string[];
    defaultAllow?: boolean;
    defaultPolicy?: any;
    allowFromPathSuffix?: string;
    policyPathSuffix?: string;
    approveChannelId?: string;
    approveHint?: string;
    normalizeEntry?: (entry: string) => string | null | undefined;
    resolveFallbackAccountId?: (account: any) => string | undefined;
    resolvePolicy?: (account: any) => unknown;
    resolveAllowFrom?: (account: any) => string[] | undefined;
    inheritSharedDefaultsFromDefaultAccount?: boolean;
    [key: string]: any;
  };
  [key: string]: any;
};

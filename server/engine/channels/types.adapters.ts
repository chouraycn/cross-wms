// 移植自 openclaw/src/channels/plugins/types.adapters.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ChannelOutboundAdapter = unknown;

export type ChannelOutboundChunkContext = unknown;

export type ChannelOutboundContext = unknown;

export type ChannelOutboundFormattedContext = unknown;

export type ChannelOutboundPayloadContext = unknown;

export type ChannelOutboundPayloadHint = unknown;

export type ChannelOutboundTargetRef = unknown;

export type ChannelDeliveryCapabilities = unknown;

export type ChannelPairingAdapter = unknown;

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
    binding: unknown;
    compiledBinding: ChannelConfiguredBindingConversationRef;
    conversationId: string;
    parentConversationId?: string;
  }) => ChannelConfiguredBindingMatch | null;
};

export type ChannelConversationBindingSupport = unknown;

export type ChannelSecurityAdapter = unknown;

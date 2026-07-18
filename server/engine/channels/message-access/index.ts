// 频道入站/消息访问公开 barrel。作为需要访问决策但无需插件内部的调用方的窄导入点。
//
// 移植自 openclaw/src/channels/message-access/index.ts。
// 注意：openclaw 原版还导出 decision/runtime/runtime-identity/store-allow-from/
// effective-allow-from/state 等模块，但这些模块依赖 cross-wms 中实现不同的
// command-gating、mention-gating、allow-from、pairing-store 等模块，暂未移植。
// 当前仅导出已移植的低依赖文件：types、runtime-types、allowlist。

export {
  allowlistFailureReason,
  redactedAllowlistDiagnostics,
  applyMutableIdentifierPolicy,
  effectiveGroupSenderAllowlist,
} from "./allowlist.js";

export type * from "./types.js";
export type {
  ChannelIngressAccessGroupMembershipResolver,
  ChannelIngressCommandPresetInput,
  ChannelIngressConfigInput,
  ChannelIngressEventPresetInput,
  ChannelIngressIdentityAlias,
  ChannelIngressIdentityDescriptor,
  ChannelIngressIdentityField,
  ChannelIngressIdentitySubjectInput,
  ChannelIngressRouteAccess,
  ChannelIngressRouteDescriptor,
  ChannelIngressResolver,
  ChannelIngressResolverMessageParams,
  ChannelIngressSenderAccess,
  ChannelIngressCommandAccess,
  ChannelIngressActivationAccess,
  ChannelMessageIngressCommandInput,
  CreateChannelIngressResolverParams,
  ResolvedChannelMessageIngress,
  ResolveChannelMessageIngressParams,
  ResolveStableChannelMessageIngressParams,
  StableChannelIngressIdentityParams,
} from "./runtime-types.js";

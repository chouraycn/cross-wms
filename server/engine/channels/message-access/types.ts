/**
 * 频道入站访问图内部类型。
 *
 * 定义脱敏标识符、白名单诊断、路由事实与决策门。
 *
 * 移植自 openclaw/src/channels/message-access/types.ts。
 * 依赖降级：AccessGroupConfig、ChatChannelId、InboundImplicitMentionKind、InboundMentionFacts
 * 通过 ../_openclaw-stubs.js 提供占位。
 */
import type { AccessGroupConfig, ChatChannelId } from "../_openclaw-stubs.js";
import type { InboundImplicitMentionKind, InboundMentionFacts } from "../_openclaw-stubs.js";

/** 入站诊断与配置查找中使用的频道标识。 */
export type ChannelIngressChannelId = ChatChannelId;

/** 白名单规范化与匹配使用的脱敏标识符类别。 */
export type ChannelIngressIdentifierKind =
  | "stable-id"
  | "username"
  | "email"
  | "phone"
  | "role"
  | `plugin:${string}`;

/** 可参与白名单匹配的公开脱敏标识符素材。 */
export type MatchableIdentifier = {
  opaqueId: string;
  kind: ChannelIngressIdentifierKind;
  dangerous?: boolean;
  sensitivity?: "normal" | "pii";
};

/** 保留原始可比较值的内部标识符素材。 */
export type InternalMatchMaterial = MatchableIdentifier & {
  value: string;
};

/** 共享入站内核使用的内部主体表示。 */
export type InternalChannelIngressSubject = {
  identifiers: InternalMatchMaterial[];
};

/** 规范化白名单条目的公开脱敏形式。 */
export type ChannelIngressNormalizedEntry = {
  opaqueEntryId: string;
  kind: ChannelIngressIdentifierKind;
  dangerous?: boolean;
  sensitivity?: "normal" | "pii";
};

/** 保留原始可比较值的内部规范化白名单条目。 */
export type InternalNormalizedEntry = ChannelIngressNormalizedEntry & {
  value: string;
};

/** 无效、禁用或不支持的白名单条目脱敏诊断。 */
export type RedactedIngressEntryDiagnostic = {
  opaqueEntryId?: string;
  reasonCode: IngressReasonCode;
};

/** 暴露给调用方与访问事实的白名单匹配结果脱敏形式。 */
export type RedactedIngressMatch = {
  matched: boolean;
  matchedEntryIds: string[];
};

/** 一组白名单条目的公开规范化结果。 */
export type ChannelIngressNormalizeResult = {
  matchable: ChannelIngressNormalizedEntry[];
  invalid: RedactedIngressEntryDiagnostic[];
  disabled: RedactedIngressEntryDiagnostic[];
};

/** 保留原始可比较条目值的内部规范化结果。 */
export type InternalChannelIngressNormalizeResult = Omit<
  ChannelIngressNormalizeResult,
  "matchable"
> & {
  matchable: InternalNormalizedEntry[];
};

/** 为共享入站内核提供频道特定身份匹配的适配器。 */
export type InternalChannelIngressAdapter = {
  normalizeEntries(params: {
    entries: readonly string[];
    context: "dm" | "group" | "route" | "command";
    accountId: string;
  }): InternalChannelIngressNormalizeResult | Promise<InternalChannelIngressNormalizeResult>;

  matchSubject(params: {
    subject: InternalChannelIngressSubject;
    entries: readonly InternalNormalizedEntry[];
    context: "dm" | "group" | "route" | "command";
  }): RedactedIngressMatch | Promise<RedactedIngressMatch>;
};

/** 白名单条目引用的已解析访问组成员事实。 */
export type AccessGroupMembershipFact =
  | {
      kind: "matched";
      groupName: string;
      source: "static" | "dynamic";
      matchedEntryIds: string[];
    }
  | {
      kind: "not-matched";
      groupName: string;
      source: "static" | "dynamic";
    }
  | {
      kind: "missing" | "unsupported" | "failed";
      groupName: string;
      source: "static" | "dynamic";
      reasonCode: IngressReasonCode;
      diagnosticId?: string;
    };

/** 单个入站门的完全规范化白名单事实。 */
export type ResolvedIngressAllowlist = {
  rawEntryCount: number;
  normalizedEntries: ChannelIngressNormalizedEntry[];
  invalidEntries: RedactedIngressEntryDiagnostic[];
  disabledEntries: RedactedIngressEntryDiagnostic[];
  matchedEntryIds: string[];
  hasConfiguredEntries: boolean;
  hasMatchableEntries: boolean;
  hasWildcard: boolean;
  accessGroups: {
    referenced: string[];
    matched: string[];
    missing: string[];
    unsupported: string[];
    failed: string[];
  };
  match: RedactedIngressMatch;
};

/** 可安全暴露在访问图中的脱敏白名单事实。 */
export type RedactedIngressAllowlistFacts = {
  configured: boolean;
  matched: boolean;
  reasonCode: IngressReasonCode;
  matchedEntryIds: string[];
  invalidEntryCount: number;
  disabledEntryCount: number;
  accessGroups: ResolvedIngressAllowlist["accessGroups"];
};

/** 路由查找状态投射到入站访问图。 */
export type RouteGateState =
  | "not-configured"
  | "matched"
  | "not-matched"
  | "disabled"
  | "lookup-failed";

/** 匹配路由如何影响发送者白名单评估。 */
export type RouteSenderPolicy = "inherit" | "replace" | "deny-when-empty";

/** 路由发送者策略贡献发送者条目时使用的来源列表。 */
export type RouteSenderAllowlistSource = "effective-dm" | "effective-group";

/** 频道特定路由器提供的原始路由门事实。 */
export type RouteGateFacts = {
  id: string;
  kind: "route" | "routeSender" | "membership" | "ownerAllowlist" | "nestedAllowlist";
  gate: RouteGateState;
  effect: "allow" | "block-dispatch" | "ignore";
  precedence: number;
  senderPolicy: RouteSenderPolicy;
  senderAllowFrom?: Array<string | number>;
  senderAllowFromSource?: RouteSenderAllowlistSource;
  match?: RedactedIngressMatch;
};

/** 路由特定发送者白名单规范化后的路由门事实。 */
export type ResolvedRouteGateFacts = Omit<
  RouteGateFacts,
  "senderAllowFrom" | "senderAllowFromSource"
> & {
  senderAllowlist?: ResolvedIngressAllowlist;
};

/** 用于选择命令、配对、origin-subject 规则的入站事件事实。 */
export type ChannelIngressEventInput = {
  kind:
    | "message"
    | "reaction"
    | "button"
    | "postback"
    | "native-command"
    | "slash-command"
    | "system";
  authMode: "inbound" | "command" | "origin-subject" | "route-only" | "none";
  mayPair: boolean;
  originSubject?: InternalChannelIngressSubject;
};

/** 决策与访问事实中暴露的脱敏事件事实。 */
export type RedactedChannelIngressEvent = Omit<ChannelIngressEventInput, "originSubject"> & {
  hasOriginSubject: boolean;
  originSubjectMatched: boolean;
};

/** 共享入站状态解析器的完整原始输入。 */
export type ChannelIngressStateInput = {
  channelId: ChannelIngressChannelId;
  accountId: string;
  subject: InternalChannelIngressSubject;
  conversation: {
    kind: "direct" | "group" | "channel";
    id: string;
    parentId?: string;
    threadId?: string;
    title?: string;
  };
  adapter: InternalChannelIngressAdapter;
  accessGroups?: Record<string, AccessGroupConfig>;
  accessGroupMembership?: readonly AccessGroupMembershipFact[];
  routeFacts?: RouteGateFacts[];
  mentionFacts?: InboundMentionFacts;
  event: ChannelIngressEventInput;
  allowlists: {
    dm?: Array<string | number>;
    group?: Array<string | number>;
    commandOwner?: Array<string | number>;
    commandGroup?: Array<string | number>;
    pairingStore?: Array<string | number>;
  };
};

/** 决定入站图如何评估的策略旋钮。 */
export type ChannelIngressPolicyInput = {
  dmPolicy: "pairing" | "allowlist" | "open" | "disabled";
  groupPolicy: "allowlist" | "open" | "disabled";
  groupAllowFromFallbackToAllowFrom?: boolean;
  mutableIdentifierMatching?: "disabled" | "enabled";
  activation?: {
    requireMention: boolean;
    allowTextCommands: boolean;
    allowedImplicitMentionKinds?: readonly InboundImplicitMentionKind[];
    order?: "before-sender" | "after-command";
  };
  command?: {
    useAccessGroups?: boolean;
    allowTextCommands: boolean;
    hasControlCommand: boolean;
    modeWhenAccessGroupsOff?: "allow" | "deny" | "configured";
  };
};

/** 入站图中某个门的有序阶段。 */
export type IngressGatePhase = "route" | "sender" | "command" | "event" | "activation";

/** 入站图与投射访问事实中使用的门种类。 */
export type IngressGateKind =
  | "route"
  | "routeSender"
  | "dmSender"
  | "groupSender"
  | "membership"
  | "ownerAllowlist"
  | "nestedAllowlist"
  | "command"
  | "event"
  | "mention";

/** 计算最终入站准入时某个门产生的效果。 */
export type IngressGateEffect =
  | "allow"
  | "block-dispatch"
  | "block-command"
  | "skip"
  | "observe"
  | "ignore";

/** 入站诊断的稳定机器可读原因码。 */
export type IngressReasonCode =
  | "allowed"
  | "route_blocked"
  | "route_sender_empty"
  | "dm_policy_disabled"
  | "dm_policy_open"
  | "dm_policy_allowlisted"
  | "dm_policy_pairing_required"
  | "dm_policy_not_allowlisted"
  | "group_policy_disabled"
  | "group_policy_open"
  | "group_policy_allowed"
  | "group_policy_empty_allowlist"
  | "group_policy_not_allowlisted"
  | "command_authorized"
  | "control_command_unauthorized"
  | "event_authorized"
  | "event_unauthorized"
  | "event_pairing_not_allowed"
  | "sender_not_required"
  | "origin_subject_missing"
  | "origin_subject_not_matched"
  | "activation_allowed"
  | "activation_skipped"
  | "access_group_missing"
  | "access_group_unsupported"
  | "access_group_failed"
  | "mutable_identifier_disabled"
  | "no_policy_match";

/** 有序入站访问图中一个已评估的门。 */
export type AccessGraphGate = {
  id: string;
  phase: IngressGatePhase;
  kind: IngressGateKind;
  effect: IngressGateEffect;
  allowed: boolean;
  reasonCode: IngressReasonCode;
  match?: RedactedIngressMatch;
  allowlist?: RedactedIngressAllowlistFacts;
  sender?: {
    policy: ChannelIngressPolicyInput["dmPolicy"] | ChannelIngressPolicyInput["groupPolicy"];
  };
  command?: {
    useAccessGroups: boolean;
    allowTextCommands: boolean;
    modeWhenAccessGroupsOff?: "allow" | "deny" | "configured";
    shouldBlockControlCommand: boolean;
  };
  event?: RedactedChannelIngressEvent;
  activation?: {
    hasMentionFacts: boolean;
    requireMention: boolean;
    allowTextCommands: boolean;
    allowedImplicitMentionKinds?: readonly InboundImplicitMentionKind[];
    order?: "before-sender" | "after-command";
    shouldSkip: boolean;
    canDetectMention?: boolean;
    wasMentioned?: boolean;
    hasAnyMention?: boolean;
    implicitMentionKinds?: readonly InboundImplicitMentionKind[];
    effectiveWasMentioned?: boolean;
    shouldBypassMention?: boolean;
  };
};

/** 所有已评估入站门的有序图。 */
export type AccessGraph = {
  gates: AccessGraphGate[];
};

/** 策略门归约为决策之前的规范化入站状态。 */
export type ChannelIngressState = {
  channelId: ChannelIngressChannelId;
  accountId: string;
  conversationKind: "direct" | "group" | "channel";
  event: RedactedChannelIngressEvent;
  mentionFacts?: InboundMentionFacts;
  routeFacts: ResolvedRouteGateFacts[];
  allowlists: {
    dm: ResolvedIngressAllowlist;
    pairingStore: ResolvedIngressAllowlist;
    group: ResolvedIngressAllowlist;
    commandOwner: ResolvedIngressAllowlist;
    commandGroup: ResolvedIngressAllowlist;
  };
};

/** 入站事件的最终运行时准入动作。 */
export type ChannelIngressAdmission = "dispatch" | "observe" | "skip" | "drop" | "pairing-required";

/** 已解析频道入站事件的最终决策与图。 */
export type ChannelIngressDecision = {
  admission: ChannelIngressAdmission;
  decision: "allow" | "block" | "pairing";
  decisiveGateId: string;
  reasonCode: IngressReasonCode;
  graph: AccessGraph;
};

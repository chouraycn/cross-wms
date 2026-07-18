/**
 * 公开频道入站运行时类型。
 *
 * 定义身份描述符、解析器输入、路由访问与已解析访问结果。
 *
 * 移植自 openclaw/src/channels/message-access/runtime-types.ts。
 * 依赖降级：AccessGroupConfig 通过 ../_openclaw-stubs.js 提供占位。
 */
import type { AccessGroupConfig } from "../_openclaw-stubs.js";
import type {
  AccessGroupMembershipFact,
  AccessGraphGate,
  ChannelIngressChannelId,
  ChannelIngressDecision,
  ChannelIngressEventInput,
  ChannelIngressIdentifierKind,
  ChannelIngressPolicyInput,
  ChannelIngressState,
  ChannelIngressStateInput,
  IngressReasonCode,
  InternalChannelIngressAdapter,
  InternalChannelIngressSubject,
  InternalMatchMaterial,
  InternalNormalizedEntry,
  RouteGateFacts,
} from "./types.js";

/** 用于将入站发送者与白名单条目匹配的规范化标识符素材。 */
export type ChannelIngressSubjectIdentifier = InternalMatchMaterial;

/** 由稳定 id 加可选平台别名组装的脱敏主体身份。 */
export type ChannelIngressSubject = InternalChannelIngressSubject;

/** 频道身份适配器产生的规范化白名单条目素材。 */
export type ChannelIngressAdapterEntry = InternalNormalizedEntry;

/** 入站解析器用于规范化条目并匹配主体的适配器。 */
export type ChannelIngressAdapter = InternalChannelIngressAdapter;

/** 描述一个用于稳定 id 或平台特定别名的身份字段。 */
export type ChannelIngressIdentityField = {
  /** 主体别名映射与诊断中使用的唯一字段键。 */
  key?: string;
  /** 写入访问图的脱敏标识符类别。 */
  kind?: ChannelIngressIdentifierKind;
  /** 当不存在侧特定规范化器时，条目与主体共用的共享规范化器。 */
  normalize?: (value: string) => string | null | undefined;
  /** 规范化此身份字段的已配置白名单条目。 */
  normalizeEntry?: (value: string) => string | null | undefined;
  /** 规范化此身份字段的入站主体值。 */
  normalizeSubject?: (value: string) => string | null | undefined;
  /** 在诊断中将标识符标记为危险，例如可变显示名。 */
  dangerous?: boolean | ((value: string) => boolean | undefined);
  /** 诊断与访问图消费者的脱敏提示。 */
  sensitivity?: "normal" | "pii";
};

/** 命名别名字段，如 email、phone、UUID、room id 或平台用户 id。 */
export type ChannelIngressIdentityAlias = ChannelIngressIdentityField & {
  key: string;
};

/** 频道解析器的身份契约。插件在此提供平台规范化。 */
export type ChannelIngressIdentityDescriptor = {
  /** 主稳定身份字段。平台有不可变发送者 id 时优先使用。 */
  primary: ChannelIngressIdentityField;
  /** 可匹配遗留或平台特定白名单条目的附加标识符。 */
  aliases?: readonly ChannelIngressIdentityAlias[];
  /** 当原始白名单条目应授权所有发送者时返回 true。 */
  isWildcardEntry?: (value: string) => boolean;
  /** 用于平台特定身份等价的可选自定义匹配钩子。 */
  matchEntry?: (params: {
    subject: ChannelIngressSubject;
    entry: ChannelIngressAdapterEntry;
    context: "dm" | "group" | "route" | "command";
  }) => boolean | undefined;
  /** 为诊断生成稳定的脱敏条目 id。 */
  resolveEntryId?: (params: {
    entry: string;
    entryIndex: number;
    fieldKey: string;
    fieldIndex: number;
  }) => string;
};

/** 使用可选别名定义稳定身份描述符的便捷输入。 */
export type StableChannelIngressIdentityParams = ChannelIngressIdentityField &
  Pick<ChannelIngressIdentityDescriptor, "aliases" | "isWildcardEntry" | "matchEntry"> & {
    /** 当省略 `resolveEntryId` 时用于生成条目 id 的前缀。 */
    entryIdPrefix?: string;
    /** 脱敏诊断中使用的自定义条目 id 生成器。 */
    resolveEntryId?: ChannelIngressIdentityDescriptor["resolveEntryId"];
  };

/** 插件为单个入站事件传递的原始发送者身份。 */
export type ChannelIngressIdentitySubjectInput = {
  /** 当访问组匹配时追加到有效白名单的稳定发送者 id。 */
  stableId?: string | number | null;
  /** 由 `ChannelIngressIdentityAlias.key` 键控的可选身份别名。 */
  aliases?: Record<string, string | number | null | undefined>;
};

/** 入站解析器消费的最小配置子集。 */
export type ChannelIngressConfigInput = {
  /** 白名单条目引用的静态或动态访问组定义。 */
  accessGroups?: ChannelIngressStateInput["accessGroups"];
  /** 用于访问组命令行为的命令配置。 */
  commands?: { useAccessGroups?: boolean } | null;
} | null;

/** 控制命令授权的命令门输入。 */
export type ChannelMessageIngressCommandInput = NonNullable<
  ChannelIngressPolicyInput["command"]
> & {
  /** 显式命令所有者白名单；默认为有效 DM 白名单。 */
  commandOwnerAllowFrom?: Array<string | number> | null;
  /** 控制群组命令所有者是否继承已配置的 DM 所有者。 */
  groupOwnerAllowFrom?: "configured" | "none";
  /** 允许直接消息命令检查复用有效群组白名单。 */
  directGroupAllowFrom?: "effective" | "none";
  /** 群组命令 allowFrom 回退，独立于普通群组发送者策略。 */
  commandGroupAllowFromFallbackToAllowFrom?: boolean;
};

/** `createChannelIngressResolver` 接受的命令门预设形式。 */
export type ChannelIngressCommandPresetInput = Omit<
  Partial<ChannelMessageIngressCommandInput>,
  "useAccessGroups"
> & {
  /** 设为 false 以完全省略命令门。 */
  requested?: boolean;
  /** 覆盖此命令决策的 `cfg.commands.useAccessGroups`。 */
  useAccessGroups?: boolean | null;
  /** 用于派生命令访问组行为的配置子集。 */
  cfg?: ChannelIngressConfigInput;
};

/** `createChannelIngressResolver` 接受的事件门预设形式。 */
export type ChannelIngressEventPresetInput = Partial<ChannelIngressEventInput> & {
  /** 用于派生群组事件配对默认值的便捷标志。 */
  isGroup?: boolean;
};

/** 可选路由门，如 room、thread、topic、guild 或 group 路由。 */
export type ChannelIngressRouteDescriptor = {
  /** 诊断中使用的稳定路由 id。 */
  id: string;
  /** 用于诊断与访问图消费者的路由种类。 */
  kind?: RouteGateFacts["kind"];
  /** 此路由策略是否已配置。 */
  configured?: boolean;
  /** 入站事件是否匹配此路由。 */
  matched?: boolean;
  /** 此路由是否准许入站事件。 */
  allowed?: boolean;
  /** 是否在图中包含此路由描述符。 */
  enabled?: boolean;
  /** 提供多个路由描述符时的排序提示。 */
  precedence?: number;
  /** 路由发送者白名单如何与有效频道白名单组合。 */
  senderPolicy?: RouteGateFacts["senderPolicy"];
  /** 路由特定发送者白名单条目。 */
  senderAllowFrom?: Array<string | number> | null;
  /** 路由发送者条目是否来自有效 DM 或群组策略。 */
  senderAllowFromSource?: RouteGateFacts["senderAllowFromSource"];
  /** 路由的可选脱敏匹配 id。 */
  matchId?: string;
  /** 此路由阻止事件时使用的原因。 */
  blockReason?: string;
};

/** 为需要平台查找的群组调用的动态访问组解析器。 */
export type ChannelIngressAccessGroupMembershipResolver = (params: {
  name: string;
  group: AccessGroupConfig;
  channelId: ChannelIngressChannelId;
  accountId: string;
  subject: ChannelIngressIdentitySubjectInput;
}) => boolean | Promise<boolean>;

/** 解析单个入站频道消息或事件的完整输入。 */
export type ResolveChannelMessageIngressParams = {
  /** 用于配置、诊断、访问组与配对存储读取的频道 id。 */
  channelId: ChannelIngressChannelId;
  /** 限定此频道实例的账户 id。 */
  accountId: string;
  /** 规范化发送者与白名单素材的身份描述符。 */
  identity: ChannelIngressIdentityDescriptor;
  /** 此事件的入站发送者身份。 */
  subject: ChannelIngressIdentitySubjectInput;
  /** 会话分类与 id。 */
  conversation: ChannelIngressStateInput["conversation"];
  /** 事件鉴权模式与配对/origin-subject 事实。 */
  event: ChannelIngressEventInput;
  /** 发送者、命令、事件、路由与激活策略。 */
  policy: ChannelIngressPolicyInput;
  /** 原始直接消息白名单条目。 */
  allowFrom?: Array<string | number> | null;
  /** 原始群组发送者白名单条目。 */
  groupAllowFrom?: Array<string | number> | null;
  /** 用于构建路由门的路由描述符。 */
  route?: ChannelIngressRouteDescriptor | readonly ChannelIngressRouteDescriptor[];
  /** 低层调用方使用的预构建路由事实。 */
  routeFacts?: RouteGateFacts[];
  /** 白名单条目引用的访问组配置。 */
  accessGroups?: ChannelIngressStateInput["accessGroups"];
  /** 此主体的预计算访问组成员事实。 */
  accessGroupMembership?: readonly AccessGroupMembershipFact[];
  /** 动态访问组的解析器。 */
  resolveAccessGroupMembership?: ChannelIngressAccessGroupMembershipResolver;
  /** 当访问组匹配时追加到有效白名单的具体发送者条目。 */
  accessGroupMatchedAllowFromEntry?: string | number | null;
  /** 记录是否应用了 provider 特定的缺失配置回退。 */
  providerMissingFallbackApplied?: boolean;
  /** 激活门的提及或激活事实。 */
  mentionFacts?: ChannelIngressStateInput["mentionFacts"];
  /** 直接消息白名单素材的可选配对存储读取器。 */
  readStoreAllowFrom?: (params: {
    channelId: ChannelIngressChannelId;
    accountId: string;
    dmPolicy: ChannelIngressPolicyInput["dmPolicy"];
  }) => Promise<readonly (string | number)[] | null | undefined>;
  /** 当未提供显式读取器时读取默认配对存储。 */
  useDefaultPairingStore?: boolean;
  /** 命令门输入；不请求命令策略时省略。 */
  command?: ChannelMessageIngressCommandInput;
};

/** 同一频道账户重复事件的共享解析器默认值。 */
export type CreateChannelIngressResolverParams = Pick<
  ResolveChannelMessageIngressParams,
  | "channelId"
  | "accountId"
  | "identity"
  | "accessGroups"
  | "accessGroupMembership"
  | "resolveAccessGroupMembership"
  | "accessGroupMatchedAllowFromEntry"
  | "readStoreAllowFrom"
  | "useDefaultPairingStore"
> & {
  /** 用于访问组与命令行为的配置子集。 */
  cfg?: ChannelIngressConfigInput;
  /** 此解析器中访问组展开的全局覆盖。 */
  useAccessGroups?: boolean | null;
  /** 省略它的消息调用的默认 DM 策略。 */
  defaultDmPolicy?: ChannelIngressPolicyInput["dmPolicy"];
  /** 省略它的消息调用的默认群组策略。 */
  defaultGroupPolicy?: ChannelIngressPolicyInput["groupPolicy"];
  /** 默认群组白名单回退行为。 */
  groupAllowFromFallbackToAllowFrom?: boolean;
  /** 此解析器的可变标识符匹配策略。 */
  mutableIdentifierMatching?: ChannelIngressPolicyInput["mutableIdentifierMatching"];
};

/** `createChannelIngressResolver` 创建的解析器的单消息输入。 */
export type ChannelIngressResolverMessageParams = Omit<
  ResolveChannelMessageIngressParams,
  | "channelId"
  | "accountId"
  | "identity"
  | "accessGroups"
  | "resolveAccessGroupMembership"
  | "accessGroupMatchedAllowFromEntry"
  | "readStoreAllowFrom"
  | "useDefaultPairingStore"
  | "event"
  | "policy"
  | "command"
> & {
  /** 事件事实或预设；默认为普通入站消息事件。 */
  event?: ChannelIngressEventInput | ChannelIngressEventPresetInput;
  /** 此事件的 DM 策略覆盖。 */
  dmPolicy?: ChannelIngressPolicyInput["dmPolicy"];
  /** 此事件的群组策略覆盖。 */
  groupPolicy?: ChannelIngressPolicyInput["groupPolicy"];
  /** 与解析器默认值合并的附加策略字段。 */
  policy?: Partial<Omit<ChannelIngressPolicyInput, "dmPolicy" | "groupPolicy">>;
  /** 命令门输入、预设或 false 以抑制命令检查。 */
  command?: ChannelMessageIngressCommandInput | ChannelIngressCommandPresetInput | false;
};

/** 用于消息、命令与事件表面的可复用高层入站解析器。 */
export type ChannelIngressResolver = {
  /** 解析带发送者、路由、命令、事件与激活门的普通入站消息。 */
  message(params: ChannelIngressResolverMessageParams): Promise<ResolvedChannelMessageIngress>;
  /** 解析带命令鉴权默认启用的命令导向事件。 */
  command(params: ChannelIngressResolverMessageParams): Promise<ResolvedChannelMessageIngress>;
  /** 解析带事件门默认启用的非消息事件。 */
  event(params: ChannelIngressResolverMessageParams): Promise<ResolvedChannelMessageIngress>;
};

/** 使用简单稳定身份描述符的一次性助手输入。 */
export type ResolveStableChannelMessageIngressParams = Omit<
  CreateChannelIngressResolverParams,
  "identity"
> &
  ChannelIngressResolverMessageParams & { identity?: StableChannelIngressIdentityParams };

/** 频道处理器消费的发送者/会话投射。 */
export type ChannelIngressSenderAccess = {
  /** 当发送者门准许事件时为 true。 */
  allowed: boolean;
  /** 所有门之后的最终入站决策，不仅仅是发送者门。 */
  decision: ChannelIngressDecision["decision"];
  /** 限定此决策的脱敏发送者标识符。 */
  sender?: ChannelIngressSubject;
};

/** 频道处理器消费的路由访问投射。 */
export type ChannelIngressRouteAccess = {
  /** 当路由门准许事件时为 true。 */
  allowed: boolean;
  /** 最终入站决策。 */
  decision: ChannelIngressDecision["decision"];
  /** 路由匹配事实。 */
  routes: RouteGateFacts[];
};

/** 频道处理器消费的命令访问投射。 */
export type ChannelIngressCommandAccess = {
  /** 当命令门授权事件时为 true。 */
  authorized: boolean;
  /** 最终入站决策。 */
  decision: ChannelIngressDecision["decision"];
};

/** 频道处理器消费的激活访问投射。 */
export type ChannelIngressActivationAccess = {
  /** 当激活门准许事件时为 true。 */
  allowed: boolean;
  /** 最终入站决策。 */
  decision: ChannelIngressDecision["decision"];
};

/** 已解析频道消息入站的完整结果。 */
export type ResolvedChannelMessageIngress = {
  /** 最终入站决策与访问图。 */
  decision: ChannelIngressDecision;
  /** 规范化入站状态。 */
  state: ChannelIngressState;
  /** 发送者访问投射。 */
  sender: ChannelIngressSenderAccess;
  /** 路由访问投射。 */
  route?: ChannelIngressRouteAccess;
  /** 命令访问投射。 */
  command?: ChannelIngressCommandAccess;
  /** 激活访问投射。 */
  activation?: ChannelIngressActivationAccess;
  /** 决定性门。 */
  decisiveGate?: AccessGraphGate;
  /** 规范化原因码。 */
  reasonCode: IngressReasonCode;
};

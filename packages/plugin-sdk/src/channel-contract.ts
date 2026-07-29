// 纯渠道契约类型：插件实现与测试使用的类型面。
// openclaw 原始实现从 ../channels/plugins/types.public.js、types.adapters.js 等重导出类型，
// 依赖未移植。此处本地重声明对应类型，保持公共类型签名一致。

/** 基础探测结果。 */
export type BaseProbeResult = {
  ok: boolean;
  error?: string;
};

/** 基础令牌解析。 */
export type BaseTokenResolution = {
  token?: string;
  source?: string;
};

/** 渠道 agent 工具。 */
export type ChannelAgentTool = {
  name: string;
  description?: string;
};

/** 渠道账号快照。 */
export type ChannelAccountSnapshot = {
  accountId: string;
  name?: string;
  enabled?: boolean;
  configured?: boolean;
};

/** 渠道审批适配器。 */
export type ChannelApprovalAdapter = {
  requestApproval(input: unknown): Promise<unknown>;
  resolveApproval(id: string): Promise<unknown>;
};

/** 渠道审批能力。 */
export type ChannelApprovalCapability = {
  supported: boolean;
  modes?: string[];
};

/** 渠道命令对话上下文。 */
export type ChannelCommandConversationContext = {
  channelId: string;
  command: string;
  args?: string[];
};

/** 渠道能力集合。 */
export type ChannelCapabilities = {
  typing?: boolean;
  pairing?: boolean;
  reply?: boolean;
  websocket?: boolean;
  streaming?: boolean;
  reactions?: boolean;
  threads?: boolean;
  media?: boolean;
  files?: boolean;
};

/** 渠道目录条目。 */
export type ChannelDirectoryEntry = {
  channelId: string;
  name?: string;
  type?: string;
};

/** 渠道解析类型。 */
export type ChannelResolveKind = "channel" | "account" | "group" | "dm";

/** 渠道解析结果。 */
export type ChannelResolveResult = {
  kind: ChannelResolveKind;
  channelId: string;
  accountId?: string;
};

/** 渠道群组上下文。 */
export type ChannelGroupContext = {
  groupId: string;
  groupName?: string;
};

/** 渠道日志接收器。 */
export type ChannelLogSink = {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
};

/** 渠道消息动作适配器。 */
export type ChannelMessageActionAdapter = {
  name: ChannelMessageActionName;
  execute?(context: ChannelMessageActionContext): Promise<unknown>;
};

/** 渠道消息动作上下文。 */
export type ChannelMessageActionContext = {
  channelId: string;
  messageId?: string;
};

/** 渠道消息动作发现上下文。 */
export type ChannelMessageActionDiscoveryContext = {
  channelId: string;
};

/** 渠道消息动作名称。 */
export type ChannelMessageActionName = string;

/** 渠道消息工具发现。 */
export type ChannelMessageToolDiscovery = {
  tools: ChannelAgentTool[];
};

/** 渠道消息工具 schema 贡献。 */
export type ChannelMessageToolSchemaContribution = {
  name: string;
  schema?: Record<string, unknown>;
};

/** 渠道元信息。 */
export type ChannelMeta = {
  channelId: string;
  type?: string;
  label?: string;
};

/** 渠道结构化组件。 */
export type ChannelStructuredComponents = {
  buttons?: Array<{ label: string; action?: string }>;
  cards?: Array<{ title?: string; text?: string }>;
};

/** 渠道状态问题。 */
export type ChannelStatusIssue = {
  channel: string;
  accountId?: string;
  kind: "config" | "runtime" | "auth" | "network";
  message: string;
};

/** 渠道线程上下文。 */
export type ChannelThreadingContext = {
  threadId?: string;
  rootMessageId?: string;
};

/** 渠道线程工具上下文。 */
export type ChannelThreadingToolContext = {
  supportsThreads: boolean;
};

/** 渠道工具发送。 */
export type ChannelToolSend = {
  text: string;
  media?: unknown;
};

/** 渠道旧版状态迁移计划。 */
export type ChannelLegacyStateMigrationPlan = {
  steps: Array<{ id: string; description: string }>;
};

/** 渠道目录适配器。 */
export type ChannelDirectoryAdapter = {
  listEntries?(): Promise<ChannelDirectoryEntry[]>;
  resolveEntry?(channelId: string): Promise<ChannelDirectoryEntry | undefined>;
};

/** 渠道 doctor 适配器。 */
export type ChannelDoctorAdapter = {
  diagnose?(): Promise<ChannelStatusIssue[]>;
  repair?(issue: ChannelStatusIssue): Promise<boolean>;
};

/** 渠道 doctor 配置变更。 */
export type ChannelDoctorConfigMutation = {
  changed: boolean;
  notes: string[];
};

/** 渠道 doctor 空 allowlist 账号上下文。 */
export type ChannelDoctorEmptyAllowlistAccountContext = {
  channelId: string;
  accountId: string;
};

/** 渠道 doctor 旧版配置规则。 */
export type ChannelDoctorLegacyConfigRule = {
  id: string;
  description: string;
  migrate?(config: unknown): ChannelDoctorConfigMutation;
};

/** 渠道 doctor 序列结果。 */
export type ChannelDoctorSequenceResult = {
  results: Array<{ id: string; success: boolean; mutation?: ChannelDoctorConfigMutation }>;
};

/** 渠道网关上下文。 */
export type ChannelGatewayContext = {
  gatewayUrl?: string;
  authToken?: string;
};

/** 渠道出站适配器。 */
export type ChannelOutboundAdapter = {
  send?(payload: unknown): Promise<unknown>;
  edit?(messageId: string, payload: unknown): Promise<unknown>;
  delete?(messageId: string): Promise<unknown>;
};

/** 渠道出站上下文。 */
export type ChannelOutboundContext = {
  channelId: string;
  accountId?: string;
  sessionId?: string;
};

/** 渠道出站负载提示。 */
export type ChannelOutboundPayloadHint = {
  plainText?: boolean;
  maxLength?: number;
};

/** 渠道状态适配器。 */
export type ChannelStatusAdapter<ResolvedAccount = unknown, Probe = unknown, Audit = unknown> = {
  defaultRuntime?: unknown;
  buildChannelSummary?(snapshot: unknown): unknown;
  probeAccount?(account: ResolvedAccount): Promise<Probe>;
  formatCapabilitiesProbe?(probe: Probe): unknown;
  auditAccount?(account: ResolvedAccount): Promise<Audit>;
  buildCapabilitiesDiagnostics?(audit: Audit): unknown;
  logSelfId?(account: ResolvedAccount, selfId: unknown): void;
  resolveAccountState?(account: ResolvedAccount): unknown;
  collectStatusIssues?(accounts: ResolvedAccount[]): ChannelStatusIssue[];
  buildAccountSnapshot?(params: {
    account: ResolvedAccount;
    cfg?: unknown;
    runtime?: ChannelAccountSnapshot;
    probe?: Probe;
    audit?: Audit;
  }): Promise<ChannelAccountSnapshot> | ChannelAccountSnapshot;
};

/** 渠道运行时面。 */
export type ChannelRuntimeSurface = {
  capabilities?: ChannelCapabilities;
  statusAdapter?: ChannelStatusAdapter;
  outboundAdapter?: ChannelOutboundAdapter;
};

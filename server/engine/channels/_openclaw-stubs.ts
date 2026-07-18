/**
 * Channels 本地 stub 与降级实现 — 为移植自 openclaw 的 channels 模块提供缺失依赖的占位实现。
 *
 * 设计原则：
 *  - 纯类型 stub 直接定义（与 openclaw 源定义保持一致以保证类型兼容）
 *  - 简单工具函数提供最小可用实现
 *  - 复杂运行时函数提供 no-op / 抛错的降级实现
 *
 * 缺失模块来源：
 *  - ../config/types.access-groups.js（cross-wms 配置类型尚未移植）
 *  - ./mention-gating.js（cross-wms 已有不同实现，未导出 InboundImplicitMentionKind/InboundMentionFacts）
 *  - ./ids.js（cross-wms 已有不同实现，未导出 ChatChannelId/CHAT_CHANNEL_ORDER）
 *  - ./plugins/types.core.js / types.plugin.js / types.public.js（cross-wms 已有不同实现）
 *  - ./plugins/manifest.js（cross-wms 尚未移植）
 *  - ./plugins/channel-id.types.js / bundled.js / registry.js / index.js / bundled-ids.js / thread-binding-api.js（同上）
 *  - ./streaming.js（cross-wms 实现不同，未导出 StreamingCompatEntry/StreamingMode 等）
 *  - ./message/live.js（cross-wms 尚未移植）
 *  - ../plugins/discovery.js / manifest.js / bundled-dir.js / channel-registry-state.types.js / runtime-channel-state.js
 *  - ../plugin-sdk/access-groups.js / channel-access-compat.js / channel-route.js
 *  - ../infra/outbound/session-binding-service.js / channel-target.js
 *  - ../auto-reply/{envelope,chunk,command-detection,commands-registry,inbound-debounce}.js
 *  - ../config/sessions.js / paths.js
 *  - ../routing/session-key.js / account-lookup.js
 *  - ../shared/thread-binding-lifecycle.js / text/code-regions.js
 *  - ../agents/embedded-agent-utils.js
 *  - ../utils.js / utils/boolean.js / utils/directive-tags.js / utils/conversation-target.js / utils/delivery-context.shared.js
 */

// ============================================================================
// ./mention-gating.js —— InboundImplicitMentionKind / InboundMentionFacts
// ============================================================================

/** 隐式 @ 提及的种类（与 openclaw mention-gating 保持一致）。 */
export type InboundImplicitMentionKind =
  | "reply_to_bot"
  | "quoted_bot"
  | "bot_thread_participant"
  | "native";

/** 入站 @ 提及事实（与 openclaw mention-gating 保持一致）。 */
export type InboundMentionFacts = {
  canDetectMention: boolean;
  wasMentioned: boolean;
  hasAnyMention?: boolean;
  implicitMentionKinds?: readonly InboundImplicitMentionKind[];
};

// ============================================================================
// ./ids.js —— ChatChannelId / CHAT_CHANNEL_ORDER
// ============================================================================

/** 规范化聊天通道标识（与 openclaw ids.ts 保持一致，string 别名）。 */
export type ChatChannelId = string;

/**
 * 内置聊天通道顺序（降级占位）。
 *
 * openclaw 中 CHAT_CHANNEL_ORDER 是生成代码列出的内置聊天通道 id 顺序；
 * cross-wms 的 ids.ts 不导出此常量。这里给出空数组占位，保持调用方
 * 在没有内置聊天通道元数据时优雅降级。
 */
export const CHAT_CHANNEL_ORDER: readonly ChatChannelId[] = [];

// ============================================================================
// ../config/types.access-groups.js —— AccessGroupConfig
// ============================================================================

/**
 * 访问组配置（降级占位）。
 *
 * openclaw 中 AccessGroupConfig 描述静态/动态访问组成员来源，
 * 这里仅保留 message-access 类型契约所需的最小字段。
 */
export type AccessGroupConfig = {
  /** 静态成员来源（用户名、id 等条目）。 */
  members?: Array<string | number>;
  /** 动态成员来源描述（平台特定解析）。 */
  source?: string;
  [key: string]: unknown;
};

// ============================================================================
// ./plugins/types.core.js —— ChannelAccountSnapshot / ChannelMeta 等
// ============================================================================
//
// 降级原因：cross-wms 的 channels/plugins/ 子目录是独立实现，
// 未导出 openclaw 的 ChannelAccountSnapshot 等类型。
// 这里按 openclaw 源定义复制纯类型，保证 account-snapshot-fields/summary 类型契约一致。

/** 通道账户快照（与 openclaw plugins/types.core 保持一致的最小子集）。 */
export type ChannelAccountSnapshot = {
  accountId?: string;
  enabled?: boolean;
  configured?: boolean;
  name?: string;
  linked?: boolean;
  running?: boolean;
  connected?: boolean;
  restartPending?: boolean;
  reconnectAttempts?: number;
  lastConnectedAt?: number | null;
  lastInboundAt?: number;
  lastOutboundAt?: number | null;
  lastMessageAt?: number | null;
  lastEventAt?: number | null;
  lastTransportActivityAt?: number;
  statusState?: string;
  healthState?: string;
  busy?: boolean;
  activeRuns?: number;
  lastRunActivityAt?: number | null;
  mode?: string;
  dmPolicy?: string;
  allowFrom?: string[];
  tokenSource?: string;
  botTokenSource?: string;
  appTokenSource?: string;
  signingSecretSource?: string;
  tokenStatus?: "available" | "configured_unavailable" | "missing";
  botTokenStatus?: "available" | "configured_unavailable" | "missing";
  appTokenStatus?: "available" | "configured_unavailable" | "missing";
  signingSecretStatus?: "available" | "configured_unavailable" | "missing";
  userTokenStatus?: "available" | "configured_unavailable" | "missing";
  baseUrl?: string;
  allowUnmentionedGroups?: boolean;
  cliPath?: string;
  dbPath?: string;
  port?: number;
  [key: string]: unknown;
};

/** 通道元数据（与 openclaw plugins/types.core ChannelMeta 一致的最小结构）。 */
export type ChannelMeta = {
  id: string;
  label: string;
  selectionLabel?: string;
  docsPath?: string;
  docsLabel?: string;
  blurb?: string;
  detailLabel?: string;
  systemImage?: string;
  [key: string]: unknown;
};

// ============================================================================
// ./plugins/types.plugin.js —— ChannelPlugin
// ============================================================================

/** 通道插件配置子结构（与 openclaw plugins/types.plugin 一致的最小契约）。 */
export type ChannelPluginConfig = {
  id: string;
  resolveAccount: (cfg: unknown, accountId: string) => unknown;
  inspectAccount?: (cfg: unknown, accountId: string) => Promise<unknown> | unknown;
  describeAccount?: (account: unknown, cfg: unknown) => Record<string, unknown> | undefined;
  formatAllowFrom?: (params: {
    cfg: unknown;
    accountId?: string | null;
    allowFrom: Array<string | number>;
  }) => string[];
  isEnabled?: (account: unknown, cfg: unknown) => boolean;
  isConfigured?: (account: unknown, cfg: unknown) => Promise<boolean> | boolean;
  [key: string]: unknown;
};

/** 通道插件（与 openclaw plugins/types.plugin 一致的最小契约）。 */
export type ChannelPlugin = {
  id: string;
  config: ChannelPluginConfig;
  conversationBindings?: {
    defaultTopLevelPlacement?: "current" | "child";
  };
  messaging?: {
    resolveDeliveryTarget?: (params: {
      conversationId: string;
      parentConversationId?: string;
    }) => { to?: string; threadId?: string } | undefined;
  };
  meta?: {
    aliases?: readonly string[];
    markdownCapable?: boolean;
  } | null;
  [key: string]: unknown;
};

// ============================================================================
// ./plugins/types.public.js / channel-id.types.js —— ChannelId
// ============================================================================

/** 通道标识符（与 openclaw plugins/types.public 一致，string 别名）。 */
export type ChannelId = string;

// ============================================================================
// ./plugins/manifest.js —— PluginPackageChannel
// ============================================================================

/**
 * 插件包通道元数据（与 openclaw plugins/manifest 一致的最小结构）。
 * 仅包含 chat-meta / bundled-channel-catalog-read 等模块读取的字段。
 */
export type PluginPackageChannel = {
  id?: string;
  label?: string;
  selectionLabel?: string;
  docsPath?: string;
  docsLabel?: string;
  blurb?: string;
  detailLabel?: string;
  systemImage?: string;
  aliases?: string[];
  order?: number;
  [key: string]: unknown;
};

// ============================================================================
// ./plugins/bundled.js / registry.js —— 通道插件注册查询
// ============================================================================
//
// 降级原因：cross-wms 的 registry.ts 实现不同，未提供 openclaw 的
// getBundledChannelAccountInspector / getLoadedChannelPlugin / getChannelPlugin 等访问器。
// 这里返回 undefined，让 read-only-account-inspect / route-projection 等调用方优雅降级。

/** 取已加载的通道插件（降级：始终返回 undefined）。 */
export function getLoadedChannelPlugin(_channelId: string): ChannelPlugin | undefined {
  return undefined;
}

/** 取通道插件（降级：始终返回 undefined）。 */
export function getChannelPlugin(_channelId: string): ChannelPlugin | undefined {
  return undefined;
}

/** 规范化通道 id（降级：返回原值或 undefined）。 */
export function normalizeChannelId(raw?: string | null): string | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** 取 bundled 通道账户检查器（降级：始终返回 undefined）。 */
export function getBundledChannelAccountInspector(
  _channelId: string,
): ((cfg: unknown, accountId?: string | null) => Promise<unknown> | unknown) | undefined {
  return undefined;
}

/** 解析 bundled 通道 thread-binding 默认放置（降级：始终返回 undefined）。 */
export function resolveBundledChannelThreadBindingDefaultPlacement(
  _channelId: string,
): "current" | "child" | undefined {
  return undefined;
}

/** 列出 bundled 通道 id（降级：返回空数组）。 */
export function listBundledChannelIds(
  _env?: NodeJS.ProcessEnv,
  _discovery?: unknown,
): readonly string[] {
  return [];
}

// ============================================================================
// ./plugins/persisted-auth-state.js
// ============================================================================

/** 列出带持久化认证状态的 bundled 通道 id（降级：返回空数组）。 */
export function listBundledChannelIdsWithPersistedAuthState(_discovery?: unknown): readonly string[] {
  return [];
}

/** 检查 bundled 通道是否带持久化认证状态（降级：始终返回 false）。 */
export function hasBundledChannelPersistedAuthState(_params: {
  channelId: string;
  cfg: unknown;
  env: NodeJS.ProcessEnv;
  discovery?: unknown;
}): boolean {
  return false;
}

// ============================================================================
// ../plugins/discovery.js —— PluginDiscoveryResult
// ============================================================================

/** 插件发现结果（降级占位）。 */
export type PluginDiscoveryResult = unknown;

// ============================================================================
// ../plugins/official-external-plugin-catalog.js
// ============================================================================

/** 列出官方外部通道 env vars（降级：返回空数组）。 */
export function listOfficialExternalChannelEnvVars(): ReadonlyArray<{
  channelId: string;
  envVars: string[];
}> {
  return [];
}

// ============================================================================
// ./streaming.js —— StreamingCompatEntry / StreamingMode / 进度草稿辅助
// ============================================================================
//
// 降级原因：cross-wms 的 streaming.ts 是独立简化实现，未导出 openclaw 的
// StreamingCompatEntry / StreamingMode / ChannelProgressDraftLine / 进度草稿合成器辅助等。
// 这里给出最小类型与降级函数实现，保证依赖方在 cross-wms 中可编译且优雅降级。

/** 流式预览兼容条目（与 openclaw streaming 一致的最小结构）。 */
export type StreamingCompatEntry = {
  minChars?: number;
  maxChars?: number;
  breakPreference?: "paragraph" | "newline" | "sentence";
  previewToolProgress?: boolean;
  commentaryProgress?: boolean;
  suppressDefaultToolProgressMessages?: boolean;
  [key: string]: unknown;
};

/** 流式模式（与 openclaw streaming 一致）。 */
export type StreamingMode = "off" | "progress" | "live";

/** 进度草稿行（与 openclaw streaming 一致的最小结构）。 */
export type ChannelProgressDraftLine = {
  id?: string;
  kind?: string;
  text?: string;
  label?: string;
  icon?: string;
  detail?: string;
  status?: string;
  toolName?: string;
  prefix?: boolean;
  [key: string]: unknown;
};

/** 解析通道流式预览块大小（降级：返回 undefined）。 */
export function resolveChannelStreamingPreviewChunk(
  _entry: unknown,
): StreamingCompatEntry | undefined {
  return undefined;
}

/** 创建进度草稿门控（降级：no-op）。 */
export function createChannelProgressDraftGate(_params: {
  onStart: () => Promise<void> | void;
}): {
  hasStarted: boolean;
  startNow: () => Promise<boolean>;
  noteWork: () => Promise<boolean>;
  cancel: () => void;
} {
  return {
    hasStarted: false,
    async startNow() {
      return false;
    },
    async noteWork() {
      return false;
    },
    cancel() {},
  };
}

/** 格式化进度草稿文本（降级：返回空字符串）。 */
export function formatChannelProgressDraftText(_params: {
  entry?: StreamingCompatEntry | null;
  lines?: ReadonlyArray<string | ChannelProgressDraftLine>;
  seed?: string;
  formatLine?: (line: string) => string;
}): string {
  return "";
}

/** 判断是否为工作类型工具名（降级：返回 false）。 */
export function isChannelProgressDraftWorkToolName(_toolName: string): boolean {
  return false;
}

/** 合并进度草稿行（降级：返回原数组）。 */
export function mergeChannelProgressDraftLine<TLine>(
  lines: TLine[],
  _line: ChannelProgressDraftLine | string,
  _options?: { maxLines?: number },
): TLine[] {
  return lines;
}

/** 规范化进度草稿行身份（降级：返回 undefined）。 */
export function normalizeChannelProgressDraftLineIdentity(
  _line: unknown,
): string | undefined {
  return undefined;
}

/** 解析进度草稿最大行字符数（降级：返回 0）。 */
export function resolveChannelProgressDraftMaxLineChars(_entry: unknown): number {
  return 0;
}

/** 解析进度草稿最大行数（降级：返回 0）。 */
export function resolveChannelProgressDraftMaxLines(_entry: unknown): number {
  return 0;
}

/** 解析通道流式进度评论开关（降级：返回 false）。 */
export function resolveChannelStreamingProgressCommentary(_entry: unknown): boolean {
  return false;
}

/** 解析通道流式预览工具进度开关（降级：返回 false）。 */
export function resolveChannelStreamingPreviewToolProgress(_entry: unknown): boolean {
  return false;
}

/** 解析通道流式抑制默认工具进度消息（降级：返回 false）。 */
export function resolveChannelStreamingSuppressDefaultToolProgressMessages(
  _entry: unknown,
  _options?: { draftStreamActive?: boolean; previewToolProgressEnabled?: boolean },
): boolean {
  return false;
}

// ============================================================================
// ./message/live.js —— LivePreviewFinalizer*
// ============================================================================

/** 实时预览最终器草稿（降级占位）。 */
export type LivePreviewFinalizerDraft<TId = unknown> = {
  id?: TId;
  editId?: unknown;
  [key: string]: unknown;
};

/** 实时预览最终器结果种类（降级占位）。 */
export type LivePreviewFinalizerResultKind =
  | "delivered"
  | "preview-finalized"
  | "preview-retained";

/**
 * 投递可最终化的实时预览（降级：直接调用 deliverNormally）。
 */
export async function deliverFinalizableLivePreview<TPayload, TId, TEdit>(params: {
  kind: "tool" | "block" | "final";
  payload: TPayload;
  draft?: LivePreviewFinalizerDraft<TId>;
  buildFinalEdit: (payload: TPayload) => TEdit | undefined;
  editFinal: (id: TId, edit: TEdit) => Promise<void>;
  deliverNormally: (payload: TPayload) => Promise<boolean | void>;
  onPreviewFinalized?: (id: TId) => Promise<void> | void;
  onNormalDelivered?: () => Promise<void> | void;
  logPreviewEditFailure?: (error: unknown) => void;
}): Promise<{ kind: LivePreviewFinalizerResultKind }> {
  await params.deliverNormally(params.payload);
  await params.onNormalDelivered?.();
  return { kind: "delivered" };
}

// ============================================================================
// ./plugins/channel-meta.js —— buildManifestChannelMeta
// ============================================================================

/** 根据插件清单构建通道元数据（降级：返回最小占位）。 */
export function buildManifestChannelMeta(params: {
  id: string;
  channel: PluginPackageChannel;
  label: string;
  selectionLabel?: string;
  docsPath?: string;
  docsLabel?: string;
  blurb?: string;
  detailLabel?: string;
  systemImage?: string;
  arrayFieldMode?: "non-empty" | "all";
  selectionDocsPrefixMode?: "defined" | "all";
}): ChannelMeta {
  return {
    id: params.id,
    label: params.label,
    selectionLabel: params.selectionLabel,
    docsPath: params.docsPath,
    docsLabel: params.docsLabel,
    blurb: params.blurb,
    detailLabel: params.detailLabel,
    systemImage: params.systemImage,
  };
}

// ============================================================================
// ../plugin-sdk/access-groups.js —— AccessGroupMembershipResolver
// ============================================================================

/** 访问组成员关系解析器（降级占位）。 */
export type AccessGroupMembershipResolver = (params: {
  cfg: unknown;
  channel: string;
  accountId: string;
  senderId: string;
  groupId: string;
}) => Promise<readonly string[] | undefined> | readonly string[] | undefined;

/** 扩展 allowFrom 列表（降级：直接返回原始 allowFrom 字符串化）。 */
export async function expandAllowFromWithAccessGroups(params: {
  cfg: unknown;
  allowFrom?: Array<string | number> | null;
  channel: string;
  accountId: string;
  senderId: string;
  isSenderAllowed: (senderId: string, allowFrom: string[]) => boolean;
  resolveMembership?: AccessGroupMembershipResolver;
}): Promise<string[]> {
  return (params.allowFrom ?? []).map((entry) => String(entry));
}

// ============================================================================
// ../plugin-sdk/channel-access-compat.js —— DM_GROUP_ACCESS_REASON
// ============================================================================

export const DM_GROUP_ACCESS_REASON = {
  DM_POLICY_OPEN: "dm_policy_open",
  DM_POLICY_DISABLED: "dm_policy_disabled",
  DM_POLICY_ALLOWLISTED: "dm_policy_allowlisted",
  DM_POLICY_PAIRING_REQUIRED: "dm_policy_pairing_required",
  DM_POLICY_NOT_ALLOWLISTED: "dm_policy_not_allowlisted",
} as const;

export type DmGroupAccessReasonCode =
  | "dm_policy_open"
  | "dm_policy_disabled"
  | "dm_policy_allowlisted"
  | "dm_policy_pairing_required"
  | "dm_policy_not_allowlisted";

/** 读取 store allowFrom（降级：返回空数组）。 */
export async function readStoreAllowFromForDmPolicy(_params: {
  provider: string;
  accountId: string;
  dmPolicy?: string | null;
  readStore?: (provider: string, accountId: string) => Promise<string[]>;
}): Promise<string[]> {
  return [];
}

/** 解析 DM 组访问（降级：返回最保守决策）。 */
export function resolveDmGroupAccessWithLists(_params: {
  isGroup: boolean;
  dmPolicy: string;
  allowFrom: string[];
  storeAllowFrom: string[];
  groupAllowFromFallbackToAllowFrom: boolean;
  isSenderAllowed: (allowEntries: string[]) => boolean;
}): {
  decision: "allow" | "block" | "pairing";
  reasonCode: DmGroupAccessReasonCode;
  reason: string;
  effectiveAllowFrom: string[];
} {
  return {
    decision: "block",
    reasonCode: DM_GROUP_ACCESS_REASON.DM_POLICY_NOT_ALLOWLISTED,
    reason: "Direct-DM access resolver is degraded in cross-wms.",
    effectiveAllowFrom: [],
  };
}

// ============================================================================
// ../plugin-sdk/channel-route.js —— ChannelRouteRef
// ============================================================================

/** 通道路由引用（与 openclaw plugin-sdk/channel-route 一致的最小结构）。 */
export type ChannelRouteRef = {
  channel?: string;
  accountId?: string;
  to?: string;
  threadId?: string | number;
  threadSource?: string;
  [key: string]: unknown;
};

/** 规范化通道路由引用（降级：返回原值）。 */
export function normalizeChannelRouteRef(route: ChannelRouteRef): ChannelRouteRef | undefined {
  if (!route || typeof route !== "object") {
    return undefined;
  }
  return route;
}

// ============================================================================
// ../infra/outbound/session-binding-service.js —— ConversationRef / SessionBindingRecord
// ============================================================================

/** 会话引用（与 openclaw infra/outbound/session-binding-service 一致的最小结构）。 */
export type ConversationRef = {
  channel?: string;
  accountId?: string;
  conversationId?: string;
  parentConversationId?: string;
  threadId?: string | number;
  [key: string]: unknown;
};

/** 会话绑定记录（与 openclaw infra/outbound/session-binding-service 一致的最小结构）。 */
export type SessionBindingRecord = {
  conversation?: ConversationRef | null;
  [key: string]: unknown;
};

// ============================================================================
// ../plugins/channel-registry-state.types.js —— ActivePluginChannel*
// ============================================================================

/** 活动插件通道注册（降级占位）。 */
export type ActivePluginChannelRegistration = {
  plugin: {
    id?: string | null;
    meta?: {
      aliases?: readonly string[];
      markdownCapable?: boolean;
    } | null;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

/** 活动插件通道注册表（降级占位）。 */
export type ActivePluginChannelRegistry = {
  channels?: ActivePluginChannelRegistration[];
  [key: string]: unknown;
};

/** 取活动插件通道注册表快照（降级：返回空）。 */
export function getActivePluginChannelRegistrySnapshotFromState(): {
  registry: ActivePluginChannelRegistry | null;
  version: number;
} {
  return { registry: null, version: 0 };
}

// ============================================================================
// ../auto-reply/{envelope,chunk,command-detection,commands-registry,inbound-debounce}.js
// ============================================================================

/** 解析 envelope 格式选项（降级：返回空对象）。 */
export function resolveEnvelopeFormatOptions(_cfg: unknown): Record<string, unknown> {
  return {};
}

/** 读取会话 updatedAt（降级：返回 undefined）。 */
export function readSessionUpdatedAt(_params: {
  storePath?: string;
  sessionKey: string;
}): number | undefined {
  return undefined;
}

/** 解析 store 路径（降级：返回 undefined）。 */
export function resolveStorePath(_storeCfg: unknown, _opts?: { agentId?: string }): string | undefined {
  return undefined;
}

/** 解析文本块大小限制（降级：返回 fallbackLimit）。 */
export function resolveTextChunkLimit(
  _cfg: unknown,
  _channelId: string,
  _accountId: string | null | undefined,
  opts: { fallbackLimit: number },
): number {
  return opts.fallbackLimit;
}

/** 解析入站去抖动毫秒（降级：返回 0）。 */
export function resolveInboundDebounceMs(_params: {
  cfg: unknown;
  channel: string;
  overrideMs?: number;
}): number {
  return 0;
}

/** 入站去抖动创建参数（降级占位）。 */
export type InboundDebounceCreateParams<T> = {
  debounceMs: number;
  onFlush: (items: T[]) => Promise<void> | void;
  [key: string]: unknown;
};

/** 入站去抖动器（降级占位）。 */
export type InboundDebouncer<T> = {
  push: (item: T) => void;
  flush: () => Promise<void>;
  cancel: () => void;
};

/** 创建入站去抖动器（降级：返回 no-op）。 */
export function createInboundDebouncer<T>(
  _params: InboundDebounceCreateParams<T>,
): InboundDebouncer<T> {
  return {
    push() {},
    async flush() {},
    cancel() {},
  };
}

/** 命令规范化选项（降级占位）。 */
export type CommandNormalizeOptions = unknown;

/** 判断是否为控制命令消息（降级：返回 false）。 */
export function isControlCommandMessage(
  _text: string,
  _cfg: unknown,
  _options?: CommandNormalizeOptions,
): boolean {
  return false;
}

// ============================================================================
// ../routing/{session-key,account-lookup}.js
// ============================================================================

/** 规范化账户 ID（降级：返回 trim 后的字符串或空）。 */
export function normalizeAccountId(value?: string | null): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

/** 解析账户条目（降级：返回 undefined）。 */
export function resolveAccountEntry(
  _accounts?: Record<string, unknown>,
  _accountId?: string,
): unknown {
  return undefined;
}

// ============================================================================
// ../shared/thread-binding-lifecycle.js
// ============================================================================

/** 线程绑定生命周期记录（降级占位）。 */
export type ThreadBindingLifecycleRecord = {
  createdAt?: number;
  lastActivityAt?: number;
  idleTimeoutMs?: number;
  maxAgeMs?: number;
  [key: string]: unknown;
};

/** 解析线程绑定生命周期（降级：返回原记录）。 */
export function resolveSharedThreadBindingLifecycle(_params: {
  record: ThreadBindingLifecycleRecord;
  defaultIdleTimeoutMs?: number;
  defaultMaxAgeMs?: number;
}): { expiresAt?: number } {
  return { expiresAt: undefined };
}

// ============================================================================
// ../shared/text/code-regions.js
// ============================================================================

export type CodeRegion = { start: number; end: number };

/** 查找代码区域（降级：返回空数组）。 */
export function findCodeRegions(_text: string): CodeRegion[] {
  return [];
}

/** 判断偏移量是否在代码区域内（降级：返回 false）。 */
export function isInsideCode(_offset: number, _regions: CodeRegion[]): boolean {
  return false;
}

// ============================================================================
// ../agents/embedded-agent-utils.js
// ============================================================================

/** 格式化推理消息（降级：返回原值）。 */
export function formatReasoningMessage(text: string): string {
  return text;
}

// ============================================================================
// ../utils.js —— isRecord
// ============================================================================

/** 判断值是否为 record 对象（与 openclaw utils.js 中 isRecord 一致）。 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

/** 判断值是否非空字符串。 */
export function hasNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

// ============================================================================
// ../utils/boolean.js —— asBoolean
// ============================================================================

/** 强制转换为 boolean（与 openclaw utils/boolean 一致）。 */
export function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }
  }
  return undefined;
}

// ============================================================================
// ../utils/directive-tags.js
// ============================================================================

/** 移除投递用内联指令标签（降级：返回原文本）。 */
export function stripInlineDirectiveTagsForDelivery(text: string): { text: string } {
  return { text };
}

// ============================================================================
// ../infra/json-files.js —— tryReadJsonSync（cross-wms 已有但路径不同）
// ============================================================================

/** 同步读取 JSON（降级：失败返回 null）。 */
export function tryReadJsonSync<T>(filePath: string): T | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const fs = require("node:fs") as typeof import("node:fs");
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

// ============================================================================
// ../infra/openclaw-root.js —— resolveOpenClawPackageRootSync
// ============================================================================

/** 解析 openclaw 包根目录（降级：返回 null）。 */
export function resolveOpenClawPackageRootSync(_params?: {
  cwd?: string;
  moduleUrl?: string;
}): string | null {
  return null;
}

// ============================================================================
// ../plugins/bundled-dir.js
// ============================================================================

/** 解析 bundled 插件目录（降级：返回 null）。 */
export function resolveBundledPluginsDir(): string | null {
  return null;
}

// ============================================================================
// ../config/paths.js —— resolveStateDir
// ============================================================================

/** 解析状态目录（降级：返回默认 ~/.openclaw）。 */
export function resolveStateDir(
  _env: NodeJS.ProcessEnv,
  homeDir: string,
): string {
  return `${homeDir}/.openclaw`;
}

// ============================================================================
// ../infra/outbound/channel-target.js —— hasNonEmptyString（重复定义合并）
// ============================================================================
// 注：hasNonEmptyString 已在 ../utils.js 段落定义，此处不再重复。

// ============================================================================
// @openclaw/normalization-core/number-coercion —— MAX_DATE_TIMESTAMP_MS
// ============================================================================

/** Date-valid 毫秒时间戳最大值（与 cross-wms infra/number-coercion 一致）。 */
export const MAX_DATE_TIMESTAMP_MS = 8_640_000_000_000_000 as const;

// ============================================================================
// @openclaw/net-policy/url-userinfo —— stripUrlUserInfo
// ============================================================================

/**
 * 移除 URL 中的 userinfo 部分（降级实现）。
 *
 * 仅移除 `scheme://user:pass@host` 中的 `user:pass@`，保留其他部分。
 */
export function stripUrlUserInfo(url: string): string {
  if (typeof url !== "string" || !url) {
    return url;
  }
  return url.replace(/^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)[^/@]*@/, "$1");
}

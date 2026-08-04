/**
 * @deprecated This file uses legacy stub naming.
 * Future refactoring should rename to *.stub.ts convention.
 * See P3-23 in optimization plan.
 */

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

import { fileURLToPath } from "node:url";
import path from "node:path";

// ESM 模块下 __filename/__dirname 不可用，通过 import.meta.url 解析
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
 * 内置聊天通道顺序（移植自 openclaw/src/channels/ids.ts）。
 *
 * openclaw 中 CHAT_CHANNEL_ORDER 是生成代码列出的内置聊天通道 id 顺序；
 * cross-wms 的 ids.ts 不导出此常量。这里按 channel-providers/index.ts 导出
 * 的通道提供者列出 cross-wms 实际支持的通道 id，按字母序排序后冻结。
 */
export const CHAT_CHANNEL_ORDER: readonly ChatChannelId[] = Object.freeze([
  "discord",
  "dingtalk",
  "email",
  "feishu",
  "slack",
  "telegram",
  "wechat",
  "webhook",
]);

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
// 复用 cross-wms 的 plugins/runtime-channel-state.ts 真实实现读取活动注册表。
// 移植自 openclaw/src/channels/plugins/registry-loaded-read.ts 的查找逻辑。

/** 取已加载的通道插件（复用真实注册表快照）。 */
export function getLoadedChannelPlugin(channelId: string): ChannelPlugin | undefined {
  const resolvedId = channelId?.trim().toLowerCase();
  if (!resolvedId) {
    return undefined;
  }
  const registry = getActivePluginChannelRegistryFromStateImpl();
  if (!registry || !Array.isArray(registry.channels)) {
    return undefined;
  }
  for (const entry of registry.channels) {
    const plugin = entry?.plugin as ChannelPlugin | null | undefined;
    const pluginId = plugin?.id?.trim().toLowerCase();
    if (plugin && pluginId === resolvedId) {
      return plugin;
    }
  }
  return undefined;
}

/** 取通道插件（复用真实注册表快照，与 getLoadedChannelPlugin 一致）。 */
export function getChannelPlugin(channelId: string): ChannelPlugin | undefined {
  return getLoadedChannelPlugin(channelId);
}

/** 规范化通道 id（降级：返回原值或 undefined）。 */
export function normalizeChannelId(raw?: string | null): string | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * 取 bundled 通道账户检查器（移植自 openclaw channels/plugins/registry）。
 *
 * 优先返回已加载通道插件的 config.inspectAccount；
 * 当插件未声明 inspectAccount 时返回 undefined（调用方按降级处理）。
 */
export function getBundledChannelAccountInspector(
  channelId: string,
): ((cfg: unknown, accountId?: string | null) => Promise<unknown> | unknown) | undefined {
  const plugin = getLoadedChannelPlugin(channelId);
  const inspectAccount = plugin?.config?.inspectAccount;
  if (typeof inspectAccount !== "function") {
    return undefined;
  }
  return inspectAccount as (cfg: unknown, accountId?: string | null) => Promise<unknown> | unknown;
}

/**
 * 解析 bundled 通道 thread-binding 默认放置（移植自 openclaw channels/plugins/thread-binding-api）。
 *
 * 优先读取已加载通道插件的 conversationBindings.defaultTopLevelPlacement；
 * 当插件未加载或未声明时回退到 "current"（openclaw 默认值）。
 */
export function resolveBundledChannelThreadBindingDefaultPlacement(
  channelId: string,
): "current" | "child" | undefined {
  const plugin = getLoadedChannelPlugin(channelId);
  const placement = plugin?.conversationBindings?.defaultTopLevelPlacement;
  return placement === "child" ? "child" : "current";
}

/**
 * 列出 bundled 通道 id（移植自 openclaw/src/channels/plugins/bundled-ids.ts）。
 *
 * 使用 cross-wms 的 listChannelCatalogEntries 读取 bundled 通道目录，
 * 返回排序后的通道 id 列表。
 */
export function listBundledChannelIds(
  env?: NodeJS.ProcessEnv,
  discovery?: unknown,
): readonly string[] {
  return listChannelCatalogEntries({
    origin: "bundled",
    env,
    discovery,
  })
    .map((entry) => entry.channel?.id)
    .filter((id): id is string => Boolean(id))
    .sort((a, b) => a.localeCompare(b));
}

// ============================================================================
// ./plugins/persisted-auth-state.js
// ============================================================================

/**
 * 列出带持久化认证状态的 bundled 通道 id（移植自 openclaw channels/plugins/persisted-auth-state.ts）。
 *
 * openclaw 中通过读取通道包元数据的 persistedAuthState 字段判断；
 * cross-wms 降级为：检查已加载通道插件是否声明了 token 相关配置来源
 * （tokenSource / botTokenSource / appTokenSource / signingSecretSource）。
 */
export function listBundledChannelIdsWithPersistedAuthState(_discovery?: unknown): readonly string[] {
  const result: string[] = [];
  for (const channelId of CHAT_CHANNEL_ORDER) {
    const plugin = getLoadedChannelPlugin(channelId);
    if (!plugin?.config) {
      continue;
    }
    const cfg = plugin.config;
    if (
      cfg.tokenSource ||
      cfg.botTokenSource ||
      cfg.appTokenSource ||
      cfg.signingSecretSource
    ) {
      result.push(channelId);
    }
  }
  return result;
}

/**
 * 检查 bundled 通道是否带持久化认证状态（移植自 openclaw channels/plugins/persisted-auth-state.ts）。
 *
 * 降级策略：检查已加载通道插件是否声明了 token 相关配置来源，
 * 或环境变量中是否存在该通道对应的 token 配置。
 */
export function hasBundledChannelPersistedAuthState(params: {
  channelId: string;
  cfg: unknown;
  env?: NodeJS.ProcessEnv;
  discovery?: unknown;
}): boolean {
  const channelId = params.channelId?.trim().toLowerCase();
  if (!channelId) {
    return false;
  }
  // 优先检查已加载通道插件的 token 来源声明
  const plugin = getLoadedChannelPlugin(channelId);
  if (plugin?.config) {
    const cfg = plugin.config;
    if (
      cfg.tokenSource ||
      cfg.botTokenSource ||
      cfg.appTokenSource ||
      cfg.signingSecretSource
    ) {
      return true;
    }
  }
  // 检查环境变量中是否有该通道的 token 配置（大写通道 id 前缀）
  const env = params.env ?? process.env;
  const upperChannel = channelId.toUpperCase();
  const tokenEnvKeys = [
    `${upperChannel}_TOKEN`,
    `${upperChannel}_BOT_TOKEN`,
    `${upperChannel}_APP_TOKEN`,
    `${upperChannel}_SIGNING_SECRET`,
    `${upperChannel}_API_KEY`,
    `${upperChannel}_API_SECRET`,
  ];
  return tokenEnvKeys.some(
    (key) => typeof env[key] === "string" && env[key]!.trim().length > 0,
  );
}

// ============================================================================
// ../plugins/discovery.js —— PluginDiscoveryResult
// ============================================================================

/** 插件发现结果（降级占位）。 */
export type PluginDiscoveryResult = unknown;

// ============================================================================
// ../plugins/official-external-plugin-catalog.js
// ============================================================================

/**
 * 列出官方外部通道 env vars（移植自 openclaw/src/plugins/official-external-plugin-catalog.ts）。
 *
 * openclaw 中从 official-external-channel-catalog.json 读取通道清单的 envVars 字段；
 * cross-wms 未携带该 JSON 目录，这里按 cross-wms 已知通道的常见 env vars 降级返回。
 */
export function listOfficialExternalChannelEnvVars(): ReadonlyArray<{
  channelId: string;
  envVars: string[];
}> {
  // cross-wms 已知通道的常见环境变量（按 channel-providers 对齐）
  return [
    { channelId: "discord", envVars: ["DISCORD_TOKEN", "DISCORD_BOT_TOKEN"] },
    { channelId: "dingtalk", envVars: ["DINGTALK_TOKEN", "DINGTALK_APP_KEY", "DINGTALK_APP_SECRET"] },
    { channelId: "email", envVars: ["EMAIL_SMTP_HOST", "EMAIL_SMTP_USER", "EMAIL_SMTP_PASS", "EMAIL_IMAP_HOST", "EMAIL_IMAP_USER", "EMAIL_IMAP_PASS"] },
    { channelId: "feishu", envVars: ["FEISHU_APP_ID", "FEISHU_APP_SECRET", "FEISHU_VERIFICATION_TOKEN"] },
    { channelId: "slack", envVars: ["SLACK_BOT_TOKEN", "SLACK_APP_TOKEN", "SLACK_SIGNING_SECRET"] },
    { channelId: "telegram", envVars: ["TELEGRAM_BOT_TOKEN"] },
    { channelId: "wechat", envVars: ["WECHAT_TOKEN", "WECHAT_APP_ID", "WECHAT_APP_SECRET"] },
    { channelId: "webhook", envVars: ["WEBHOOK_SECRET", "WEBHOOK_TOKEN"] },
  ];
}

// ============================================================================
// ./streaming.js —— StreamingCompatEntry / StreamingMode / 进度草稿辅助
// ============================================================================
//
// 复用 cross-wms 已有的真实实现（channels/streaming.ts），
// 该文件已完整移植自 openclaw，提供流式配置解析、进度草稿合成等全部能力。
// 以下通过重新导出与薄包装函数委托给真实实现。

import {
  createChannelProgressDraftGate as createChannelProgressDraftGateImpl,
  formatChannelProgressDraftText as formatChannelProgressDraftTextImpl,
  isChannelProgressDraftWorkToolName as isChannelProgressDraftWorkToolNameImpl,
  mergeChannelProgressDraftLine as mergeChannelProgressDraftLineImpl,
  normalizeChannelProgressDraftLineIdentity as normalizeChannelProgressDraftLineIdentityImpl,
  resolveChannelProgressDraftMaxLineChars as resolveChannelProgressDraftMaxLineCharsImpl,
  resolveChannelProgressDraftMaxLines as resolveChannelProgressDraftMaxLinesImpl,
  resolveChannelStreamingPreviewChunk as resolveChannelStreamingPreviewChunkImpl,
  resolveChannelStreamingPreviewToolProgress as resolveChannelStreamingPreviewToolProgressImpl,
  resolveChannelStreamingProgressCommentary as resolveChannelStreamingProgressCommentaryImpl,
  resolveChannelStreamingSuppressDefaultToolProgressMessages as resolveChannelStreamingSuppressDefaultToolProgressMessagesImpl,
  type StreamingCompatEntry as StreamingCompatEntryImpl,
} from "./streaming.js";

/** 流式预览兼容条目（重新导出自 streaming.ts）。 */
export type StreamingCompatEntry = StreamingCompatEntryImpl;

/** 流式模式（重新导出自 streaming.ts）。 */
export type StreamingMode = "off" | "progress" | "live";

/**
 * 进度草稿行（兼容包装：在 streaming.ts 真实类型基础上添加索引签名，
 * 保证依赖方解构访问额外字段时类型兼容）。
 */
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

/** 解析通道流式预览块大小（委托给 streaming.ts 真实实现）。 */
export function resolveChannelStreamingPreviewChunk(
  entry: unknown,
): StreamingCompatEntry | undefined {
  return resolveChannelStreamingPreviewChunkImpl(
    entry as StreamingCompatEntryImpl | null | undefined,
  ) as StreamingCompatEntry | undefined;
}

/** 创建进度草稿门控（委托给 streaming.ts 真实实现）。 */
export function createChannelProgressDraftGate(params: {
  onStart: () => Promise<void> | void;
}): {
  hasStarted: boolean;
  startNow: () => Promise<boolean>;
  noteWork: () => Promise<boolean>;
  cancel: () => void;
} {
  return createChannelProgressDraftGateImpl(params) as {
    hasStarted: boolean;
    startNow: () => Promise<boolean>;
    noteWork: () => Promise<boolean>;
    cancel: () => void;
  };
}

/** 格式化进度草稿文本（委托给 streaming.ts 真实实现）。 */
export function formatChannelProgressDraftText(params: {
  entry?: StreamingCompatEntry | null;
  lines?: ReadonlyArray<string | ChannelProgressDraftLine>;
  seed?: string;
  formatLine?: (line: string) => string;
}): string {
  return formatChannelProgressDraftTextImpl({
    entry: params.entry as StreamingCompatEntryImpl | null | undefined,
    lines: params.lines as Array<string | Parameters<typeof formatChannelProgressDraftTextImpl>[0]["lines"][number]>,
    seed: params.seed,
    formatLine: params.formatLine,
  });
}

/** 判断是否为工作类型工具名（委托给 streaming.ts 真实实现）。 */
export function isChannelProgressDraftWorkToolName(toolName: string): boolean {
  return isChannelProgressDraftWorkToolNameImpl(toolName);
}

/** 合并进度草稿行（委托给 streaming.ts 真实实现）。 */
export function mergeChannelProgressDraftLine<TLine>(
  lines: TLine[],
  line: ChannelProgressDraftLine | string,
  options?: { maxLines?: number },
): TLine[] {
  return mergeChannelProgressDraftLineImpl(
    lines as Array<string | Parameters<typeof mergeChannelProgressDraftLineImpl>[0]>,
    line as Parameters<typeof mergeChannelProgressDraftLineImpl>[1],
    options,
  ) as TLine[];
}

/** 规范化进度草稿行身份（委托给 streaming.ts 真实实现）。 */
export function normalizeChannelProgressDraftLineIdentity(
  line: unknown,
): string | undefined {
  const result = normalizeChannelProgressDraftLineIdentityImpl(
    line as Parameters<typeof normalizeChannelProgressDraftLineIdentityImpl>[0],
  );
  return result || undefined;
}

/** 解析进度草稿最大行字符数（委托给 streaming.ts 真实实现）。 */
export function resolveChannelProgressDraftMaxLineChars(entry: unknown): number {
  return resolveChannelProgressDraftMaxLineCharsImpl(
    entry as StreamingCompatEntryImpl | null | undefined,
  );
}

/** 解析进度草稿最大行数（委托给 streaming.ts 真实实现）。 */
export function resolveChannelProgressDraftMaxLines(entry: unknown): number {
  return resolveChannelProgressDraftMaxLinesImpl(
    entry as StreamingCompatEntryImpl | null | undefined,
  );
}

/** 解析通道流式进度评论开关（委托给 streaming.ts 真实实现）。 */
export function resolveChannelStreamingProgressCommentary(entry: unknown): boolean {
  return resolveChannelStreamingProgressCommentaryImpl(
    entry as StreamingCompatEntryImpl | null | undefined,
  );
}

/** 解析通道流式预览工具进度开关（委托给 streaming.ts 真实实现）。 */
export function resolveChannelStreamingPreviewToolProgress(entry: unknown): boolean {
  return resolveChannelStreamingPreviewToolProgressImpl(
    entry as StreamingCompatEntryImpl | null | undefined,
  );
}

/** 解析通道流式抑制默认工具进度消息（委托给 streaming.ts 真实实现）。 */
export function resolveChannelStreamingSuppressDefaultToolProgressMessages(
  entry: unknown,
  options?: { draftStreamActive?: boolean; previewToolProgressEnabled?: boolean },
): boolean {
  return resolveChannelStreamingSuppressDefaultToolProgressMessagesImpl(
    entry as StreamingCompatEntryImpl | null | undefined,
    options,
  );
}

// ============================================================================
// ./message/live.js —— LivePreviewFinalizer*
// ============================================================================

/** 实时预览最终器草稿（移植自 openclaw channels/message/live.ts）。 */
export type LivePreviewFinalizerDraft<TId = unknown> = {
  flush: () => Promise<void>;
  id: () => TId | undefined;
  seal?: () => Promise<void>;
  discardPending?: () => Promise<void>;
  clear: () => Promise<void>;
};

/** 实时预览最终器结果种类（移植自 openclaw channels/message/live.ts）。 */
export type LivePreviewFinalizerResultKind =
  | "normal-delivered"
  | "normal-skipped"
  | "preview-finalized"
  | "preview-retained";

/**
 * 投递可最终化的实时预览（移植自 openclaw channels/message/live.ts）。
 *
 * 流程：
 *  1. kind !== "final" 或无 draft → 直接 deliverNormally
 *  2. kind === "final" 且有 draft → 尝试 buildFinalEdit + editFinal 最终化预览
 *  3. 最终化失败 → 降级为 discardPending/clear + deliverNormally
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
  // 非 final 或无 draft 时直接正常投递
  if (params.kind !== "final" || !params.draft) {
    const delivered = await params.deliverNormally(params.payload);
    if (delivered === false) {
      return { kind: "normal-skipped" };
    }
    await params.onNormalDelivered?.();
    return { kind: "normal-delivered" };
  }

  const draft = params.draft;
  // 尝试构建最终编辑
  const edit = params.buildFinalEdit(params.payload);
  if (edit !== undefined) {
    await draft.flush();
    const previewId = draft.id();
    if (previewId !== undefined) {
      await draft.seal?.();
      let editSucceeded = false;
      try {
        await params.editFinal(previewId, edit);
        editSucceeded = true;
      } catch (err) {
        params.logPreviewEditFailure?.(err);
        // 编辑失败时降级为正常投递
      }
      if (editSucceeded) {
        await params.onPreviewFinalized?.(previewId);
        return { kind: "preview-finalized" };
      }
    }
  }

  // 最终化失败或不可行：丢弃待处理内容后正常投递
  if (draft.discardPending) {
    await draft.discardPending();
  } else {
    await draft.clear();
  }

  let delivered = false;
  try {
    const result = await params.deliverNormally(params.payload);
    delivered = result !== false;
    if (delivered) {
      await params.onNormalDelivered?.();
    }
  } finally {
    if (delivered) {
      await draft.clear();
    }
  }

  return { kind: delivered ? "normal-delivered" : "normal-skipped" };
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

/** 访问组成员关系解析器（降级占位，与 openclaw plugin-sdk/access-groups 兼容）。 */
export type AccessGroupMembershipResolver = (params: {
  cfg: unknown;
  channel: string;
  accountId: string;
  senderId: string;
  groupId: string;
}) => Promise<readonly string[] | undefined> | readonly string[] | undefined;

/**
 * 扩展 allowFrom 列表（移植自 openclaw/src/plugin-sdk/access-groups.ts）。
 *
 * 复用 cross-wms 已有的真实实现（plugin-sdk/access-groups.ts），
 * 该文件已完整移植自 openclaw：合并 allowFrom 与 accessGroup:<name> 匹配的
 * 具体发送者条目。延迟 require 避免循环依赖。
 */
export async function expandAllowFromWithAccessGroups(params: {
  cfg: unknown;
  allowFrom?: Array<string | number> | null;
  channel: string;
  accountId: string;
  senderId: string;
  isSenderAllowed: (senderId: string, allowFrom: string[]) => boolean;
  resolveMembership?: AccessGroupMembershipResolver;
}): Promise<string[]> {
  return expandAllowFromWithAccessGroupsImpl({
    cfg: params.cfg as Parameters<typeof expandAllowFromWithAccessGroupsImpl>[0]["cfg"],
    allowFrom: params.allowFrom,
    channel: params.channel,
    accountId: params.accountId,
    senderId: params.senderId,
    isSenderAllowed: params.isSenderAllowed,
    resolveMembership: params.resolveMembership as Parameters<typeof expandAllowFromWithAccessGroupsImpl>[0]["resolveMembership"],
  });
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

/** 读取 store allowFrom（移植自 openclaw message-access/store-allow-from.js）。 */
export async function readStoreAllowFromForDmPolicy(params: {
  provider: string;
  accountId: string;
  dmPolicy?: string | null;
  readStore?: (provider: string, accountId: string) => Promise<string[]>;
}): Promise<string[]> {
  // allowlist/open 策略下不读取 pairing store
  if (params.dmPolicy === "allowlist" || params.dmPolicy === "open") {
    return [];
  }
  const readStore = params.readStore;
  if (!readStore) {
    return [];
  }
  try {
    return await readStore(params.provider, params.accountId);
  } catch {
    return [];
  }
}

// ----------------------------------------------------------------------------
// DM 组访问决策辅助（移植自 openclaw allow-from.js / dm-policy-shared.js /
// plugin-sdk/group-access.js 的最小内联实现）
// ----------------------------------------------------------------------------

/** 规范化字符串条目列表（移植自 @cdf-know/normalization-core/string-normalization）。 */
function normalizeStringEntries(entries: Array<string | number> | null | undefined): string[] {
  if (!Array.isArray(entries)) {
    return [];
  }
  return Array.from(
    new Set(
      entries
        .map((entry) => String(entry ?? "").trim())
        .filter((entry) => entry.length > 0),
    ),
  );
}

/** 合并 DM allowFrom 与 pairing-store 条目（移植自 channels/allow-from.js）。 */
function mergeDmAllowFromSources(params: {
  allowFrom?: Array<string | number>;
  storeAllowFrom?: Array<string | number>;
  dmPolicy?: string;
}): string[] {
  const storeEntries =
    params.dmPolicy === "allowlist" || params.dmPolicy === "open"
      ? []
      : (params.storeAllowFrom ?? []);
  return normalizeStringEntries([...(params.allowFrom ?? []), ...storeEntries]);
}

/** 解析群组 allowFrom 来源（移植自 channels/allow-from.js）。 */
function resolveGroupAllowFromSources(params: {
  allowFrom?: Array<string | number>;
  groupAllowFrom?: Array<string | number>;
  fallbackToAllowFrom?: boolean;
}): string[] {
  const explicitGroupAllowFrom =
    Array.isArray(params.groupAllowFrom) && params.groupAllowFrom.length > 0
      ? params.groupAllowFrom
      : undefined;
  const scoped = explicitGroupAllowFrom
    ? explicitGroupAllowFrom
    : params.fallbackToAllowFrom === false
      ? []
      : (params.allowFrom ?? []);
  return normalizeStringEntries(scoped);
}

type GroupPolicy = "open" | "disabled" | "allowlist";

/** 评估匹配的群组访问决策（移植自 plugin-sdk/group-access.js）。 */
function evaluateMatchedGroupAccessForPolicy(params: {
  groupPolicy: GroupPolicy;
  allowlistConfigured: boolean;
  allowlistMatched: boolean;
}): { allowed: boolean; reason: "allowed" | "disabled" | "empty_allowlist" | "not_allowlisted" | "missing_match_input" } {
  if (params.groupPolicy === "disabled") {
    return { allowed: false, reason: "disabled" };
  }
  if (params.groupPolicy === "allowlist") {
    if (!params.allowlistConfigured) {
      return { allowed: false, reason: "empty_allowlist" };
    }
    if (!params.allowlistMatched) {
      return { allowed: false, reason: "not_allowlisted" };
    }
  }
  return { allowed: true, reason: "allowed" };
}

/** 解析 DM 组访问（移植自 openclaw security/dm-policy-shared.js resolveDmGroupAccessWithLists）。 */
export function resolveDmGroupAccessWithLists(params: {
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
  const dmPolicy = params.dmPolicy ?? "pairing";

  // 合并 effective allowFrom 与 effectiveGroupAllowFrom
  const effectiveAllowFrom = normalizeStringEntries(
    mergeDmAllowFromSources({
      allowFrom: params.allowFrom,
      storeAllowFrom: params.storeAllowFrom,
      dmPolicy,
    }),
  );
  const effectiveGroupAllowFrom = normalizeStringEntries(
    resolveGroupAllowFromSources({
      allowFrom: params.allowFrom,
      fallbackToAllowFrom: params.groupAllowFromFallbackToAllowFrom ?? undefined,
    }),
  );

  // 群组消息先评估群组策略
  if (params.isGroup) {
    const groupPolicy: GroupPolicy = "allowlist";
    const groupAccess = evaluateMatchedGroupAccessForPolicy({
      groupPolicy,
      allowlistConfigured: effectiveGroupAllowFrom.length > 0,
      allowlistMatched: params.isSenderAllowed(effectiveGroupAllowFrom),
    });
    if (groupAccess.allowed) {
      return {
        decision: "allow",
        reasonCode: DM_GROUP_ACCESS_REASON.DM_POLICY_ALLOWLISTED,
        reason: `groupPolicy=${groupPolicy}`,
        effectiveAllowFrom,
      };
    }
    return {
      decision: "block",
      reasonCode: DM_GROUP_ACCESS_REASON.DM_POLICY_NOT_ALLOWLISTED,
      reason: `groupPolicy=${groupPolicy} (${groupAccess.reason})`,
      effectiveAllowFrom,
    };
  }

  // DM 策略决策
  if (dmPolicy === "disabled") {
    return {
      decision: "block",
      reasonCode: DM_GROUP_ACCESS_REASON.DM_POLICY_DISABLED,
      reason: "dmPolicy=disabled",
      effectiveAllowFrom,
    };
  }
  if (dmPolicy === "open") {
    // open 策略下 * 表示完全开放，否则仍需 allowlist 匹配
    if (effectiveAllowFrom.includes("*")) {
      return {
        decision: "allow",
        reasonCode: DM_GROUP_ACCESS_REASON.DM_POLICY_OPEN,
        reason: "dmPolicy=open",
        effectiveAllowFrom,
      };
    }
    if (params.isSenderAllowed(effectiveAllowFrom)) {
      return {
        decision: "allow",
        reasonCode: DM_GROUP_ACCESS_REASON.DM_POLICY_ALLOWLISTED,
        reason: "dmPolicy=open (allowlisted)",
        effectiveAllowFrom,
      };
    }
    return {
      decision: "block",
      reasonCode: DM_GROUP_ACCESS_REASON.DM_POLICY_NOT_ALLOWLISTED,
      reason: "dmPolicy=open (not allowlisted)",
      effectiveAllowFrom,
    };
  }
  // pairing / allowlist / 其他
  if (params.isSenderAllowed(effectiveAllowFrom)) {
    return {
      decision: "allow",
      reasonCode: DM_GROUP_ACCESS_REASON.DM_POLICY_ALLOWLISTED,
      reason: `dmPolicy=${dmPolicy} (allowlisted)`,
      effectiveAllowFrom,
    };
  }
  if (dmPolicy === "pairing") {
    return {
      decision: "pairing",
      reasonCode: DM_GROUP_ACCESS_REASON.DM_POLICY_PAIRING_REQUIRED,
      reason: "dmPolicy=pairing (not allowlisted)",
      effectiveAllowFrom,
    };
  }
  return {
    decision: "block",
    reasonCode: DM_GROUP_ACCESS_REASON.DM_POLICY_NOT_ALLOWLISTED,
    reason: `dmPolicy=${dmPolicy} (not allowlisted)`,
    effectiveAllowFrom,
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

/** 活动插件通道注册表（与 PluginRegistry 结构兼容）。 */
export type ActivePluginChannelRegistry = {
  channels?: ActivePluginChannelRegistration[];
  [key: string]: unknown;
};

/** 取活动插件通道注册表快照（复用真实实现）。 */
export function getActivePluginChannelRegistrySnapshotFromState(): {
  registry: ActivePluginChannelRegistry | null;
  version: number;
} {
  return getActivePluginChannelRegistrySnapshotFromStateImpl() as {
    registry: ActivePluginChannelRegistry | null;
    version: number;
  };
}

// ============================================================================
// ../auto-reply/{envelope,chunk,command-detection,commands-registry,inbound-debounce}.js
// ============================================================================

/**
 * 解析 envelope 格式选项（移植自 openclaw/src/auto-reply/envelope.ts）。
 *
 * 复用 cross-wms 已有的真实实现（auto-reply/envelope.ts），
 * 该文件已完整移植自 openclaw。延迟 require 避免循环依赖。
 */
export function resolveEnvelopeFormatOptions(cfg: unknown): Record<string, unknown> {
  // cross-wms 的 agents.defaults 子结构包含 envelope 相关字段
  const defaults = (cfg as { agents?: { defaults?: Record<string, unknown> } })?.agents?.defaults;
  return resolveEnvelopeFormatOptionsImpl(
    defaults as Parameters<typeof resolveEnvelopeFormatOptionsImpl>[0],
  ) as Record<string, unknown>;
}

/** 读取会话 updatedAt（移植自 openclaw config/sessions/store.ts，最小实现）。 */
export function readSessionUpdatedAt(params: {
  storePath?: string;
  sessionKey: string;
}): number | undefined {
  if (!params.storePath || !params.sessionKey) {
    return undefined;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const fs = require("node:fs") as typeof import("node:fs");
    if (!fs.existsSync(params.storePath)) {
      return undefined;
    }
    const content = fs.readFileSync(params.storePath, "utf-8");
    const store = JSON.parse(content) as { entries?: Record<string, { updatedAt?: number }> };
    const entry = store?.entries?.[params.sessionKey];
    return entry?.updatedAt;
  } catch {
    return undefined;
  }
}

/** 解析 store 路径（移植自 openclaw config/sessions/paths.ts，最小实现）。 */
export function resolveStorePath(
  storeCfg: unknown,
  opts?: { agentId?: string },
): string | undefined {
  if (typeof storeCfg === "string" && storeCfg.trim()) {
    // 支持 {agentId} 模板展开
    const agentId = opts?.agentId ?? "default";
    return storeCfg.replaceAll("{agentId}", agentId);
  }
  return undefined;
}

/** 解析文本块大小限制（移植自 openclaw auto-reply/chunk.ts）。 */
export function resolveTextChunkLimit(
  cfg: unknown,
  channelId: string,
  accountId: string | null | undefined,
  opts: { fallbackLimit: number },
): number {
  const fallback =
    typeof opts.fallbackLimit === "number" && opts.fallbackLimit > 0
      ? opts.fallbackLimit
      : 3800;
  if (!cfg || typeof cfg !== "object" || !channelId) {
    return fallback;
  }
  const cfgRecord = cfg as Record<string, unknown>;
  const channelsConfig = cfgRecord.channels as Record<string, unknown> | undefined;
  const providerConfig = channelsConfig?.[channelId] as Record<string, unknown> | undefined;
  if (!providerConfig) {
    return fallback;
  }
  // 检查 account 级别覆盖
  if (accountId) {
    const accounts = providerConfig.accounts as Record<string, Record<string, unknown>> | undefined;
    const accountCfg = accounts?.[accountId];
    const accountLimit = accountCfg?.chunkLimit ?? accountCfg?.textChunkLimit;
    if (typeof accountLimit === "number" && accountLimit > 0) {
      return accountLimit;
    }
  }
  // 检查 provider 级别覆盖
  const providerLimit = providerConfig.chunkLimit ?? providerConfig.textChunkLimit;
  if (typeof providerLimit === "number" && providerLimit > 0) {
    return providerLimit;
  }
  return fallback;
}

// 活动插件通道注册表快照：复用 cross-wms 已有的真实实现（plugins/runtime-channel-state.ts）
// 该文件已移植自 openclaw/src/plugins/runtime-channel-state.ts
import {
  getActivePluginChannelRegistrySnapshotFromState as getActivePluginChannelRegistrySnapshotFromStateImpl,
  getActivePluginChannelRegistryFromState as getActivePluginChannelRegistryFromStateImpl,
} from "../plugins/runtime-channel-state.js";

// 入站去抖动器：复用 cross-wms 已有的真实实现（auto-reply/inbound-debounce.ts）
// 该文件已完整移植自 openclaw/src/auto-reply/inbound-debounce.ts
import {
  createInboundDebouncer as createInboundDebouncerImpl,
  resolveInboundDebounceMs as resolveInboundDebounceMsImpl,
  type InboundDebounceCreateParams as InboundDebounceCreateParamsImpl,
} from "../auto-reply/inbound-debounce.js";

// 以下静态导入替换原先的 require() + try/catch 降级包装，
// 直接复用 cross-wms 已有的真实实现。
import { listChannelCatalogEntries } from "../plugins/channel-catalog-registry.js";
import { expandAllowFromWithAccessGroups as expandAllowFromWithAccessGroupsImpl } from "../plugin-sdk/access-groups.js";
import { resolveEnvelopeFormatOptions as resolveEnvelopeFormatOptionsImpl } from "../auto-reply/envelope.js";
import { isControlCommandMessage as isControlCommandMessageImpl } from "../auto-reply/command-detection.js";
import { resolveAccountEntry as resolveAccountEntryImpl } from "../routing/account-lookup.js";
import { resolveThreadBindingLifecycle as resolveThreadBindingLifecycleImpl } from "../shared/thread-binding-lifecycle.js";
import { formatReasoningMessage as formatReasoningMessageImpl } from "../agents/embedded-agent-utils.js";

/** 解析入站去抖动毫秒（复用真实实现）。 */
export function resolveInboundDebounceMs(params: {
  cfg: unknown;
  channel: string;
  overrideMs?: number;
}): number {
  return resolveInboundDebounceMsImpl(params as Parameters<typeof resolveInboundDebounceMsImpl>[0]);
}

/** 入站去抖动创建参数（保留索引签名以兼容调用方解构）。 */
export type InboundDebounceCreateParams<T> = InboundDebounceCreateParamsImpl<T> & {
  [key: string]: unknown;
};

/** 入站去抖动器（与 openclaw 真实实现一致）。 */
export type InboundDebouncer<T> = ReturnType<typeof createInboundDebouncerImpl<T>>;

/** 创建入站去抖动器（复用真实实现）。 */
export function createInboundDebouncer<T>(
  params: InboundDebounceCreateParams<T>,
): InboundDebouncer<T> {
  return createInboundDebouncerImpl<T>(params as InboundDebounceCreateParamsImpl<T>);
}

/** 命令规范化选项（移植自 openclaw commands-registry.types.ts）。 */
export type CommandNormalizeOptions = {
  /** Bot 用户名，用于从斜杠命令中去除 @mention 后缀。 */
  botUsername?: string;
};

/**
 * 判断是否为控制命令消息（移植自 openclaw/src/auto-reply/command-detection.ts）。
 *
 * 复用 cross-wms 已有的真实实现（auto-reply/command-detection.ts），
 * 该文件已完整移植自 openclaw。延迟 require 避免循环依赖。
 */
export function isControlCommandMessage(
  text: string,
  cfg: unknown,
  options?: CommandNormalizeOptions,
): boolean {
  return isControlCommandMessageImpl(text, cfg, options);
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

/**
 * 解析账户条目（移植自 openclaw/src/routing/account-lookup.ts）。
 *
 * 复用 cross-wms 已有的真实实现（routing/account-lookup.ts），
 * 该文件已完整移植自 openclaw，支持大小写不敏感的账户 id 查找。
 * 延迟 require 避免循环依赖。
 */
export function resolveAccountEntry(
  accounts?: Record<string, unknown>,
  accountId?: string,
): unknown {
  if (!accounts || typeof accounts !== "object" || !accountId) {
    return undefined;
  }
  return resolveAccountEntryImpl(accounts, accountId);
}

// ============================================================================
// ../shared/thread-binding-lifecycle.js
// ============================================================================

/** 线程绑定生命周期记录（移植自 openclaw shared/thread-binding-lifecycle.ts）。 */
export type ThreadBindingLifecycleRecord = {
  /** 绑定创建时间（epoch 毫秒）。兼容 openclaw 字段名 boundAt。 */
  boundAt?: number;
  /** 绑定创建时间（epoch 毫秒）。兼容旧字段名 createdAt。 */
  createdAt?: number;
  /** 最近活动时间（epoch 毫秒）。 */
  lastActivityAt: number;
  /** 可选的空闲超时覆盖（毫秒）；0 表示禁用空闲过期。 */
  idleTimeoutMs?: number;
  /** 可选的最大存活时间覆盖（毫秒）；0 表示禁用最大存活过期。 */
  maxAgeMs?: number;
  [key: string]: unknown;
};

/**
 * 解析线程绑定生命周期（移植自 openclaw/src/shared/thread-binding-lifecycle.ts）。
 *
 * 复用 cross-wms 已有的真实实现（shared/thread-binding-lifecycle.ts），
 * 该文件已完整移植自 openclaw，基于 lastActivityAt + idleTimeoutMs
 * 及 boundAt + maxAgeMs 计算最早过期时间。延迟 require 避免循环依赖。
 */
export function resolveSharedThreadBindingLifecycle(params: {
  record: ThreadBindingLifecycleRecord;
  defaultIdleTimeoutMs?: number;
  defaultMaxAgeMs?: number;
}): { expiresAt?: number; reason?: "idle-expired" | "max-age-expired" } {
  // 兼容 createdAt / boundAt 两种字段名
  const record = params.record;
  const boundAt = record.boundAt ?? record.createdAt ?? record.lastActivityAt;
  return resolveThreadBindingLifecycleImpl({
    record: {
      boundAt,
      lastActivityAt: record.lastActivityAt,
      idleTimeoutMs: record.idleTimeoutMs,
      maxAgeMs: record.maxAgeMs,
    },
    defaultIdleTimeoutMs: params.defaultIdleTimeoutMs ?? 0,
    defaultMaxAgeMs: params.defaultMaxAgeMs ?? 0,
  });
}

// ============================================================================
// ../shared/text/code-regions.js
// ============================================================================

export type CodeRegion = { start: number; end: number };

/** 查找代码区域（移植自 openclaw shared/text/code-regions.js）。 */
export function findCodeRegions(text: string): CodeRegion[] {
  if (!text) {
    return [];
  }
  const regions: CodeRegion[] = [];
  // 匹配围栏代码块 ```...```
  const fenceRegex = /```[^\n]*\n[\s\S]*?```/g;
  let match: RegExpExecArray | null;
  while ((match = fenceRegex.exec(text)) !== null) {
    regions.push({ start: match.index, end: match.index + match[0].length });
  }
  // 匹配行内代码 `...`
  const inlineRegex = /`[^`\n]+`/g;
  while ((match = inlineRegex.exec(text)) !== null) {
    // 跳过已在围栏代码块内的部分
    const start = match.index;
    const end = match.index + match[0].length;
    if (!regions.some((r) => start >= r.start && end <= r.end)) {
      regions.push({ start, end });
    }
  }
  return regions;
}

/** 判断偏移量是否在代码区域内（移植自 openclaw shared/text/code-regions.js）。 */
export function isInsideCode(offset: number, regions: CodeRegion[]): boolean {
  return regions.some((r) => offset >= r.start && offset < r.end);
}

// ============================================================================
// ../agents/embedded-agent-utils.js
// ============================================================================

/**
 * 格式化推理消息（移植自 openclaw/src/agents/embedded-agent-utils.ts）。
 *
 * 复用 cross-wms 已有的真实实现（agents/embedded-agent-utils.ts），
 * 该文件已完整移植自 openclaw：为每行添加斜体标记并加 "Thinking" 前缀。
 * 延迟 require 避免循环依赖。
 */
export function formatReasoningMessage(text: string): string {
  return formatReasoningMessageImpl(text);
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

/**
 * 移除投递用内联指令标签（移植自 openclaw/src/utils/directive-tags.ts）。
 *
 * 用单个空格替换 `[[audio_as_voice]]`、`[[reply_to_current]]`、
 * `[[reply_to: id]]` 及其周边空白。若文本未变化，原样返回。
 */
const INLINE_DIRECTIVE_TAG_WITH_PADDING_RE =
  /\s*(?:\[\[\s*audio_as_voice\s*\]\]|\[\[\s*(?:reply_to_current|reply_to\s*:\s*[^\]\n]+)\s*\]\])\s*/gi;

export function stripInlineDirectiveTagsForDelivery(text: string): {
  text: string;
  changed: boolean;
} {
  if (!text) {
    return { text, changed: false };
  }
  const stripped = text.replace(INLINE_DIRECTIVE_TAG_WITH_PADDING_RE, " ");
  const changed = stripped !== text;
  return {
    text: changed ? stripped.trim() : text,
    changed,
  };
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

/**
 * 解析 cross-wms 包根目录（移植自 openclaw/src/infra/openclaw-root.ts）。
 *
 * openclaw 中通过查找 package.json name === "openclaw" 的目录确定包根；
 * cross-wms 降级为：从给定候选目录或当前模块位置向上查找包含
 * pnpm-workspace.yaml / package.json 的目录。带缓存避免重复 IO。
 */
const packageRootCache = new Map<string, string | null>();

function readPackageNameSync(dir: string): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const packageJsonPath = path.join(path.resolve(dir), "package.json");
    if (!fs.existsSync(packageJsonPath)) {
      return null;
    }
    const content = fs.readFileSync(packageJsonPath, "utf-8");
    const parsed = JSON.parse(content) as { name?: unknown };
    return typeof parsed.name === "string" ? parsed.name : null;
  } catch {
    return null;
  }
}

function findPackageRootSync(startDir: string, maxDepth = 12): string | null {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const path = require("node:path") as typeof import("node:path");
  let current = path.resolve(startDir);
  for (let i = 0; i < maxDepth; i += 1) {
    const name = readPackageNameSync(current);
    if (name && (name === "cross-wms" || name === "openclaw")) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return null;
}

export function resolveOpenClawPackageRootSync(params?: {
  cwd?: string;
  moduleUrl?: string;
  argv1?: string;
}): string | null {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const path = require("node:path") as typeof import("node:path");
  const candidates: string[] = [];
  if (params?.moduleUrl) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const { fileURLToPath } = require("node:url") as typeof import("node:url");
      candidates.push(path.dirname(fileURLToPath(params.moduleUrl)));
    } catch {
      // 忽略无效 file:// URL
    }
  }
  if (params?.argv1) {
    candidates.push(path.dirname(path.resolve(params.argv1)));
  }
  if (params?.cwd) {
    candidates.push(params.cwd);
  }
  // 默认从 __dirname 向上查找
  candidates.push(__dirname);

  const cacheKey = candidates.join("\0");
  if (packageRootCache.has(cacheKey)) {
    return packageRootCache.get(cacheKey) ?? null;
  }
  for (const candidate of candidates) {
    const found = findPackageRootSync(candidate);
    if (found) {
      packageRootCache.set(cacheKey, found);
      return found;
    }
  }
  packageRootCache.set(cacheKey, null);
  return null;
}

// ============================================================================
// ../plugins/bundled-dir.js
// ============================================================================

/**
 * 解析 bundled 插件目录（移植自 openclaw/src/plugins/bundled-dir.ts）。
 *
 * openclaw 中根据包根目录查找 dist/extensions、dist-runtime/extensions、
 * extensions 等候选目录，支持环境变量覆盖与禁用开关。
 * cross-wms 降级为：复用 resolveOpenClawPackageRootSync 查找包根，
 * 再按同样的优先级查找 extensions 子目录。带缓存避免重复 IO。
 */
const bundledPluginsDirCache = new Map<string, string | null>();

function hasUsableBundledPluginTree(pluginsDir: string): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const fs = require("node:fs") as typeof import("node:fs");
    if (!fs.existsSync(pluginsDir)) {
      return false;
    }
    return fs
      .readdirSync(pluginsDir, { withFileTypes: true })
      .some((entry) => {
        if (!entry.isDirectory()) {
          return false;
        }
        // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
        const path = require("node:path") as typeof import("node:path");
        const pluginDir = path.join(pluginsDir, entry.name);
        return (
          fs.existsSync(path.join(pluginDir, "package.json")) ||
          fs.existsSync(path.join(pluginDir, "openclaw.plugin.json"))
        );
      });
  } catch {
    return false;
  }
}

function resolveBundledPluginsDirUncached(env: NodeJS.ProcessEnv): string | null {
  // 禁用开关
  const disabled = env.OPENCLAW_DISABLE_BUNDLED_PLUGINS?.trim().toLowerCase();
  if (disabled === "1" || disabled === "true") {
    return null;
  }
  // 环境变量覆盖
  const override = env.OPENCLAW_BUNDLED_PLUGINS_DIR?.trim();
  if (override) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const fs = require("node:fs") as typeof import("node:fs");
      const resolvedOverride = override.replace(/^~/, env.HOME ?? "");
      if (fs.existsSync(resolvedOverride)) {
        return resolvedOverride;
      }
    } catch {
      // 忽略
    }
  }
  // 从包根查找
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const path = require("node:path") as typeof import("node:path");
  const packageRoot = resolveOpenClawPackageRootSync({ argv1: process.argv[1] });
  const roots = [packageRoot, resolveOpenClawPackageRootSync({})].filter(
    (entry): entry is string => Boolean(entry),
  );
  for (const root of roots) {
    const candidates = [
      path.join(root, "dist", "extensions"),
      path.join(root, "dist-runtime", "extensions"),
      path.join(root, "extensions"),
    ];
    for (const candidate of candidates) {
      if (hasUsableBundledPluginTree(candidate)) {
        return candidate;
      }
    }
  }
  // 从当前模块向上查找
  try {
    let cursor = __dirname;
    for (let i = 0; i < 6; i += 1) {
      const candidate = path.join(cursor, "extensions");
      if (hasUsableBundledPluginTree(candidate)) {
        return candidate;
      }
      const parent = path.dirname(cursor);
      if (parent === cursor) {
        break;
      }
      cursor = parent;
    }
  } catch {
    // 忽略
  }
  return null;
}

export function resolveBundledPluginsDir(env: NodeJS.ProcessEnv = process.env): string | null {
  const cacheKey = env.OPENCLAW_DISABLE_BUNDLED_PLUGINS ?? "" + "|" + (env.OPENCLAW_BUNDLED_PLUGINS_DIR ?? "");
  if (bundledPluginsDirCache.has(cacheKey)) {
    return bundledPluginsDirCache.get(cacheKey) ?? null;
  }
  const resolved = resolveBundledPluginsDirUncached(env);
  bundledPluginsDirCache.set(cacheKey, resolved);
  return resolved;
}

// ============================================================================
// ../config/paths.js —— resolveStateDir
// ============================================================================

/**
 * 解析 cross-wms 状态目录（移植自 openclaw/src/config/paths.ts）。
 *
 * openclaw 中优先使用 OPENCLAW_STATE_DIR 环境变量覆盖，否则回退到 ~/.openclaw；
 * cross-wms 降级为：优先使用 OPENCLAW_STATE_DIR（兼容 cross-wms config/paths.ts），
 * 否则回退到 ~/.cross-wms。
 */
export function resolveStateDir(
  env: NodeJS.ProcessEnv,
  homeDir: string,
): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const path = require("node:path") as typeof import("node:path");
  const override = env.OPENCLAW_STATE_DIR?.trim();
  if (override) {
    return path.resolve(override);
  }
  return path.join(homeDir, ".cross-wms");
}

// ============================================================================
// ../infra/outbound/channel-target.js —— hasNonEmptyString（重复定义合并）
// ============================================================================
// 注：hasNonEmptyString 已在 ../utils.js 段落定义，此处不再重复。

// ============================================================================
// @cdf-know/normalization-core/number-coercion —— MAX_DATE_TIMESTAMP_MS
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

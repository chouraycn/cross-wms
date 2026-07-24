/**
 * 钩子消息映射器（合并 MessageHookMapper API + openclaw Canonical Context API）
 *
 * 本文件聚合两套互补的 API：
 *
 * 1. **MessageHookMapper API**（cdf-know 原始实现）
 *    - `MessageHookMapper`、`DEFAULT_MESSAGE_MAPPERS`、`MessageHookMapperManager`
 *    - 用于在 message 事件族（message:received、message:sent 等）间注册可链式
 *      转发的转换器。供 `plugin-hooks.ts` / 邮件 watcher 等做事件路由。
 *
 * 2. **Canonical Context API**（移植自 openclaw/src/hooks/message-hook-mappers.ts）
 *    - `CanonicalInboundMessageHookContext` / `CanonicalSentMessageHookContext`
 *    - `deriveInboundMessageHookContext` / `buildCanonicalSentMessageHookContext`
 *    - `toPluginMessageContext` / `toPluginInboundClaimContext` / `toPluginInboundClaimEvent`
 *    - `toPluginMessageReceivedEvent` / `toPluginMessageSentEvent`
 *    - `toInternalMessageReceivedContext` / `toInternalMessageTranscribedContext`
 *    - `toInternalMessagePreprocessedContext` / `toInternalMessageSentContext`
 *    - 用于把 openclaw 风格的 FinalizedMsgContext / 发送参数统一为钩子层
 *      关心的 Canonical Context，再分别投影到 plugin hook 与 internal hook。
 *
 * 跨模块依赖（cross-wms 适配版）：
 *   - `InternalHookEvent` / 各种 `*HookContext` / `*HookEvent` 来自 ./types.js
 *   - `PluginHookMessageContext` / `PluginHookInboundClaimContext` / ...
 *     来自 cross-wms 的 `../plugins/hook-message.types.js`
 *   - `DiagnosticTraceContext` / `freezeDiagnosticTraceContext`
 *     来自 cross-wms 的 `../infra/diagnostic-trace-context.ts`
 *   - `OpenClawConfig`（降级为 `Record<string, unknown>`）
 *     来自 cross-wms 的 `../infra/_runtime-stubs.js`
 *   - `FinalizedMsgContext`（openclaw auto-reply/templating 的入参）
 *     本文件自给自足定义一个最小子集，调用方传入 `Partial<FinalizedMsgContext>` 即可
 *   - 频道插件 `getChannelPlugin` / `normalizeChannelId`
 *     来自 cross-wms 的 `../channels/plugins/index.js`
 *     （在该模块尚未提供具体实现时回退到 `null` / 小写化）
 */

import { logger } from '../../logger.js';
import type { OpenClawConfig } from '../infra/_runtime-stubs.js';
import {
  freezeDiagnosticTraceContext,
  type DiagnosticTraceContext,
} from '../infra/diagnostic-trace-context.js';
import type {
  PluginHookInboundClaimContext,
  PluginHookInboundClaimEvent,
  PluginHookMessageContext,
  PluginHookMessageReceivedEvent,
  PluginHookMessageSentEvent,
} from '../plugins/hook-message.types.js';
import type {
  InternalHookEvent,
  MessagePreprocessedHookContext,
  MessageReceivedHookContext,
  MessageReceivedHookEvent,
  MessageSentHookContext,
  MessageTranscribedHookContext,
} from './types.js';

// ============================================================================
// Part 1: MessageHookMapper API（保留以兼容现有调用方与测试）
// ============================================================================

/**
 * 消息事件映射器：在源事件 key 触发时把事件转换为目标事件 key，
 * 可选 `transform` 在转发前改写事件本身。
 */
export interface MessageHookMapper {
  from: string;
  to: string;
  transform?: (event: InternalHookEvent) => InternalHookEvent;
  description?: string;
}

/** 内置的默认映射器集合。 */
export const DEFAULT_MESSAGE_MAPPERS: MessageHookMapper[] = [
  {
    from: 'message:receive',
    to: 'message:after-receive',
    description: 'Default mapper: receive -> after-receive',
  },
  {
    from: 'message:send',
    to: 'message:before-send',
    description: 'Default mapper: send -> before-send',
  },
  {
    from: 'message:received',
    to: 'message:preprocessed',
    description: 'Map received to preprocessed for backward compatibility',
  },
];

/**
 * 消息事件映射器管理器：支持注册、注销、链式解析、单点 transform 等能力。
 *
 * 线程安全：本管理器以单例形式存在（`messageHookMapperManager`），非线程安全。
 */
export class MessageHookMapperManager {
  private mappers: MessageHookMapper[] = [...DEFAULT_MESSAGE_MAPPERS];
  private chainMappers: Map<string, string[]> = new Map();

  register(mapper: MessageHookMapper): void {
    const idx = this.mappers.findIndex(m => m.from === mapper.from);
    if (idx !== -1) {
      this.mappers[idx] = mapper;
    } else {
      this.mappers.push(mapper);
    }
    this.rebuildChainCache();
    logger.debug(`[hooks:Mapper] Registered mapper: ${mapper.from} -> ${mapper.to}`);
  }

  unregister(from: string): void {
    const idx = this.mappers.findIndex(m => m.from === from);
    if (idx !== -1) {
      this.mappers.splice(idx, 1);
      this.rebuildChainCache();
      logger.debug(`[hooks:Mapper] Unregistered mapper: ${from}`);
    }
  }

  private rebuildChainCache(): void {
    this.chainMappers.clear();
    for (const mapper of this.mappers) {
      const chain = this.buildChain(mapper.from, new Set());
      if (chain.length > 0) {
        this.chainMappers.set(mapper.from, chain);
      }
    }
  }

  private buildChain(from: string, visited: Set<string>): string[] {
    if (visited.has(from)) return [];
    visited.add(from);

    const result: string[] = [];
    const direct = this.mappers.filter(m => m.from === from);

    for (const mapper of direct) {
      result.push(mapper.to);
      const downstream = this.buildChain(mapper.to, new Set(visited));
      result.push(...downstream);
    }

    return result;
  }

  map(eventKey: string): string[] {
    const cached = this.chainMappers.get(eventKey);
    if (cached) {
      return [...cached];
    }

    const results: string[] = [];
    for (const mapper of this.mappers) {
      if (eventKey === mapper.from) {
        results.push(mapper.to);
      }
    }
    return results;
  }

  mapAll(eventKey: string): string[] {
    const results = this.map(eventKey);
    const allResults = [...results];

    for (const result of results) {
      const downstream = this.map(result);
      for (const d of downstream) {
        if (!allResults.includes(d)) {
          allResults.push(d);
        }
      }
    }

    return allResults;
  }

  transform(eventKey: string, event: InternalHookEvent): InternalHookEvent {
    const mapper = this.mappers.find(m => m.from === eventKey);
    if (mapper?.transform) {
      return mapper.transform(event);
    }
    return event;
  }

  transformChain(eventKey: string, event: InternalHookEvent): InternalHookEvent {
    let currentEvent = event;
    let currentKey = eventKey;
    const visited = new Set<string>();

    while (currentKey && !visited.has(currentKey)) {
      visited.add(currentKey);
      const mapper = this.mappers.find(m => m.from === currentKey);
      if (!mapper) break;

      if (mapper.transform) {
        currentEvent = mapper.transform(currentEvent);
      }
      currentKey = mapper.to;
    }

    return currentEvent;
  }

  hasMapper(from: string): boolean {
    return this.mappers.some(m => m.from === from);
  }

  getMapper(from: string): MessageHookMapper | undefined {
    return this.mappers.find(m => m.from === from);
  }

  getAllMappers(): MessageHookMapper[] {
    return [...this.mappers];
  }

  getMapperCount(): number {
    return this.mappers.length;
  }

  reset(): void {
    this.mappers = [...DEFAULT_MESSAGE_MAPPERS];
    this.chainMappers.clear();
    logger.debug('[hooks:Mapper] Reset all mappers to defaults');
  }
}

/** 全局单例映射器管理器。 */
export const messageHookMapperManager = new MessageHookMapperManager();

/** 创建 message:received -> mail:incoming 的映射器。 */
export function createMessageToEmailMapper(): MessageHookMapper {
  return {
    from: 'message:received',
    to: 'mail:incoming',
    description: 'Map chat messages to email-style incoming mail hooks',
    transform: (event: InternalHookEvent): InternalHookEvent => {
      const ctx = event.context as MessageReceivedHookEvent['context'];
      return {
        ...event,
        type: 'message',
        action: 'mail-incoming',
        context: {
          ...ctx,
          subject: ctx.content.slice(0, 80),
          body: ctx.content,
          from: ctx.from,
          to: 'agent@local',
        },
      };
    },
  };
}

/** 创建 mail:incoming -> message:received 的映射器。 */
export function createEmailToMessageMapper(): MessageHookMapper {
  return {
    from: 'mail:incoming',
    to: 'message:received',
    description: 'Map incoming mail events to chat message events',
    transform: (event: InternalHookEvent): InternalHookEvent => {
      const ctx = event.context as Record<string, unknown>;
      return {
        ...event,
        type: 'message',
        action: 'received',
        context: {
          from: ctx.from as string,
          content: (ctx.body as string) || '',
          channelId: 'email',
          messageId: ctx.messageId as string,
          subject: ctx.subject as string,
        },
      };
    },
  };
}

// ============================================================================
// Part 2: Canonical Context API（移植自 openclaw）
// ============================================================================

/**
 * openclaw `FinalizedMsgContext` 的最小子集。
 *
 * 原 openclaw 在 `auto-reply/templating.js` 中定义了完整的 `FinalizedMsgContext`，
 * 字段极多；本模块只需要 `deriveInboundMessageHookContext` 用到的子集，因此在这里
 * 以 `Partial<FinalizedMsgContext>` 的形式自给自足，调用方可以传入更宽的
 * `FinalizedMsgContext` 对象（TypeScript 的结构性兼容会自动适配）。
 */
export type FinalizedMsgContext = {
  BodyForCommands?: string;
  RawBody?: string;
  Body?: string;
  BodyForAgent?: string;
  OriginatingChannel?: string;
  Surface?: string;
  Provider?: string;
  OriginatingTo?: string;
  To?: string;
  From?: string;
  GroupSubject?: string;
  GroupChannel?: string;
  MediaPaths?: unknown;
  MediaTypes?: unknown;
  MediaUrls?: unknown;
  MediaPath?: string;
  MediaUrl?: string;
  MediaType?: string;
  Timestamp?: number;
  AccountId?: string;
  SessionKey?: string;
  MessageSidFull?: string;
  MessageSid?: string;
  MessageSidFirst?: string;
  MessageSidLast?: string;
  SenderId?: string;
  SenderName?: string;
  SenderUsername?: string;
  SenderE164?: string;
  ReplyToId?: string;
  ReplyToIdFull?: string;
  ReplyToBody?: string;
  ReplyToSender?: string;
  ReplyToIsQuote?: boolean;
  MessageThreadId?: string | number;
  ThreadParentId?: string | number;
  Transcript?: string;
  GroupSpace?: string;
  TopicName?: string;
};

/** 规范化入站消息钩子上下文：所有 message 事件在钩子层都应看到此结构。 */
export type CanonicalInboundMessageHookContext = {
  from: string;
  to?: string;
  content: string;
  body?: string;
  bodyForAgent?: string;
  transcript?: string;
  timestamp?: number;
  channelId: string;
  accountId?: string;
  conversationId?: string;
  sessionKey?: string;
  runId?: string;
  messageId?: string;
  senderId?: string;
  senderName?: string;
  senderUsername?: string;
  senderE164?: string;
  replyToId?: string;
  replyToIdFull?: string;
  replyToBody?: string;
  replyToSender?: string;
  replyToIsQuote?: boolean;
  provider?: string;
  surface?: string;
  threadId?: string | number;
  threadParentId?: string | number;
  /**
   * `mediaPath(s)` 是 OpenClaw 已经下载到本地的文件；`mediaUrl(s)` 是
   * provider/media-server 引用，不一定存在于本机。
   */
  mediaPath?: string;
  mediaUrl?: string;
  mediaType?: string;
  mediaPaths?: string[];
  mediaUrls?: string[];
  mediaTypes?: string[];
  originatingChannel?: string;
  originatingTo?: string;
  guildId?: string;
  channelName?: string;
  isGroup: boolean;
  groupId?: string;
  topicName?: string;
  trace?: DiagnosticTraceContext;
  callDepth?: number;
};

/** 规范化出站消息钩子上下文。 */
export type CanonicalSentMessageHookContext = {
  to: string;
  content: string;
  success: boolean;
  error?: string;
  channelId: string;
  accountId?: string;
  conversationId?: string;
  sessionKey?: string;
  runId?: string;
  messageId?: string;
  trace?: DiagnosticTraceContext;
  callDepth?: number;
  isGroup?: boolean;
  groupId?: string;
};

// ---------------------------------------------------------------------------
// 字符串归一化工具（对应 openclaw @openclaw/normalization-core/string-coerce）
// ---------------------------------------------------------------------------

function readNonBlankString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function normalizeLowercaseStringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const filtered = value.filter(
    (item): item is string => typeof item === 'string' && item.length > 0,
  );
  return filtered.length > 0 ? filtered : undefined;
}

// ---------------------------------------------------------------------------
// 频道插件降级（cross-wms 上游 channels/plugins/index.js 仅暴露 undefined 占位导出）
// ---------------------------------------------------------------------------

/** 频道插件可解析入站会话时提供的钩子（最小子集）。 */
type ChannelPluginMessagingHook = {
  resolveInboundConversation?: (params: {
    from: string;
    to?: string;
    conversationId?: string;
    threadId?: string | number;
    threadParentId?: string | number;
    isGroup: boolean;
  }) => { conversationId?: string; parentConversationId?: string } | null;
};

type ChannelPluginLike = {
  messaging?: ChannelPluginMessagingHook;
};

const CHANNEL_PLUGIN_REGISTRY: Map<string, ChannelPluginLike> = new Map();

/** 注册/覆盖某个 channelId 的插件实现（上游补齐后可替换为正式调用）。 */
export function registerMessageHookChannelPlugin(
  channelId: string,
  plugin: ChannelPluginLike,
): void {
  CHANNEL_PLUGIN_REGISTRY.set(channelId.trim().toLowerCase(), plugin);
}

/** 清除已注册的 channel 插件（测试用）。 */
export function clearMessageHookChannelPlugins(): void {
  CHANNEL_PLUGIN_REGISTRY.clear();
}

function lookupChannelPlugin(channelId: string): ChannelPluginLike | null {
  return CHANNEL_PLUGIN_REGISTRY.get(channelId) ?? null;
}

function normalizeChannelIdLocal(value: string): string {
  return value.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// 入站上下文派生
// ---------------------------------------------------------------------------

export function deriveInboundMessageHookContext(
  ctx: FinalizedMsgContext,
  overrides?: {
    content?: string;
    messageId?: string;
  },
): CanonicalInboundMessageHookContext {
  const content =
    overrides?.content ??
    readNonBlankString(ctx.BodyForCommands) ??
    readNonBlankString(ctx.RawBody) ??
    readNonBlankString(ctx.Body) ??
    '';
  const channelId = normalizeLowercaseStringOrEmpty(
    ctx.OriginatingChannel ?? ctx.Surface ?? ctx.Provider ?? '',
  );
  const conversationId = ctx.OriginatingTo ?? ctx.To ?? ctx.From ?? undefined;
  const isGroup = Boolean(ctx.GroupSubject || ctx.GroupChannel);
  const mediaPaths = asStringArray(ctx.MediaPaths);
  const mediaTypes = asStringArray(ctx.MediaTypes);
  const mediaUrls = asStringArray(ctx.MediaUrls);
  return {
    from: ctx.From ?? '',
    to: ctx.To,
    content,
    body: ctx.Body,
    bodyForAgent: ctx.BodyForAgent,
    transcript: ctx.Transcript,
    timestamp:
      typeof ctx.Timestamp === 'number' && Number.isFinite(ctx.Timestamp)
        ? ctx.Timestamp
        : undefined,
    channelId,
    accountId: ctx.AccountId,
    conversationId,
    sessionKey: ctx.SessionKey,
    messageId:
      overrides?.messageId ??
      ctx.MessageSidFull ??
      ctx.MessageSid ??
      ctx.MessageSidFirst ??
      ctx.MessageSidLast,
    senderId: ctx.SenderId,
    senderName: ctx.SenderName,
    senderUsername: ctx.SenderUsername,
    senderE164: ctx.SenderE164,
    replyToId: ctx.ReplyToId,
    replyToIdFull: ctx.ReplyToIdFull,
    replyToBody: ctx.ReplyToBody,
    replyToSender: ctx.ReplyToSender,
    replyToIsQuote: ctx.ReplyToIsQuote,
    provider: ctx.Provider,
    surface: ctx.Surface,
    threadId: ctx.MessageThreadId,
    threadParentId: ctx.ThreadParentId,
    mediaPath: ctx.MediaPath ?? mediaPaths?.[0],
    mediaUrl: ctx.MediaUrl ?? mediaUrls?.[0],
    mediaType: ctx.MediaType ?? mediaTypes?.[0],
    mediaPaths,
    mediaUrls,
    mediaTypes,
    originatingChannel: ctx.OriginatingChannel,
    originatingTo: ctx.OriginatingTo,
    guildId: ctx.GroupSpace,
    channelName: ctx.GroupChannel,
    isGroup,
    groupId: isGroup ? conversationId : undefined,
    topicName: ctx.TopicName,
  };
}

export function buildCanonicalSentMessageHookContext(params: {
  to: string;
  content: string;
  success: boolean;
  error?: string;
  channelId: string;
  accountId?: string;
  conversationId?: string;
  sessionKey?: string;
  runId?: string;
  messageId?: string;
  trace?: DiagnosticTraceContext;
  callDepth?: number;
  isGroup?: boolean;
  groupId?: string;
}): CanonicalSentMessageHookContext {
  return {
    to: params.to,
    content: params.content,
    success: params.success,
    error: params.error,
    channelId: params.channelId,
    accountId: params.accountId,
    conversationId: params.conversationId ?? params.to,
    sessionKey: params.sessionKey,
    runId: params.runId,
    messageId: params.messageId,
    trace: params.trace,
    callDepth: params.callDepth,
    isGroup: params.isGroup,
    groupId: params.groupId,
  };
}

// ---------------------------------------------------------------------------
// 共享的 trace 字段填充器
// ---------------------------------------------------------------------------

type DiagnosticTraceHookFields = Pick<
  PluginHookMessageContext,
  'trace' | 'traceId' | 'spanId' | 'parentSpanId'
>;

function assignTraceFields(
  target: DiagnosticTraceHookFields,
  trace?: DiagnosticTraceContext,
): void {
  if (!trace) {
    return;
  }
  const safeTrace = freezeDiagnosticTraceContext(trace);
  target.trace = safeTrace;
  target.traceId = safeTrace.traceId;
  if (safeTrace.spanId) {
    target.spanId = safeTrace.spanId;
  }
  if (safeTrace.parentSpanId) {
    target.parentSpanId = safeTrace.parentSpanId;
  }
}

// ---------------------------------------------------------------------------
// Canonical -> Plugin Hook 投影
// ---------------------------------------------------------------------------

export function toPluginMessageContext(
  canonical: CanonicalInboundMessageHookContext | CanonicalSentMessageHookContext,
): PluginHookMessageContext {
  const context: PluginHookMessageContext = {
    channelId: canonical.channelId,
    accountId: canonical.accountId,
    conversationId: canonical.conversationId,
  };
  if (canonical.sessionKey) {
    context.sessionKey = canonical.sessionKey;
  }
  if (canonical.runId) {
    context.runId = canonical.runId;
  }
  if (canonical.messageId) {
    context.messageId = canonical.messageId;
  }
  if ('senderId' in canonical && canonical.senderId) {
    context.senderId = canonical.senderId;
  }
  if ('replyToId' in canonical && canonical.replyToId !== undefined) {
    context.replyToId = canonical.replyToId;
  }
  if ('replyToIdFull' in canonical && canonical.replyToIdFull !== undefined) {
    context.replyToIdFull = canonical.replyToIdFull;
  }
  if ('replyToBody' in canonical && canonical.replyToBody !== undefined) {
    context.replyToBody = canonical.replyToBody;
  }
  if ('replyToSender' in canonical && canonical.replyToSender !== undefined) {
    context.replyToSender = canonical.replyToSender;
  }
  if ('replyToIsQuote' in canonical && canonical.replyToIsQuote !== undefined) {
    context.replyToIsQuote = canonical.replyToIsQuote;
  }
  assignTraceFields(context, canonical.trace);
  if (canonical.callDepth != null) {
    context.callDepth = canonical.callDepth;
  }
  return context;
}

function stripChannelPrefix(value: string | undefined, channelId: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const genericPrefixes = ['channel:', 'chat:', 'user:'];
  for (const prefix of genericPrefixes) {
    if (value.startsWith(prefix)) {
      return value.slice(prefix.length);
    }
  }
  const prefix = `${channelId}:`;
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function resolveInboundConversation(canonical: CanonicalInboundMessageHookContext): {
  conversationId?: string;
  parentConversationId?: string;
} {
  const channelId = normalizeChannelIdLocal(canonical.channelId);
  const pluginResolved = channelId
    ? lookupChannelPlugin(channelId)?.messaging?.resolveInboundConversation?.({
        from: canonical.from,
        to: canonical.to ?? canonical.originatingTo,
        conversationId: canonical.conversationId,
        threadId: canonical.threadId,
        threadParentId: canonical.threadParentId,
        isGroup: canonical.isGroup,
      })
    : null;
  if (pluginResolved) {
    return {
      conversationId: normalizeOptionalString(pluginResolved.conversationId),
      parentConversationId: normalizeOptionalString(pluginResolved.parentConversationId),
    };
  }
  const baseConversationId = stripChannelPrefix(
    canonical.to ?? canonical.originatingTo ?? canonical.conversationId,
    canonical.channelId,
  );
  return { conversationId: baseConversationId };
}

export function toPluginInboundClaimContext(
  canonical: CanonicalInboundMessageHookContext,
): PluginHookInboundClaimContext {
  const conversation = resolveInboundConversation(canonical);
  const context: PluginHookInboundClaimContext = {
    channelId: canonical.channelId,
    accountId: canonical.accountId,
    conversationId: conversation.conversationId,
    sessionKey: canonical.sessionKey,
    parentConversationId: conversation.parentConversationId,
    senderId: canonical.senderId,
    messageId: canonical.messageId,
    runId: canonical.runId,
    callDepth: canonical.callDepth,
  };
  if (canonical.replyToId !== undefined) {
    context.replyToId = canonical.replyToId;
  }
  if (canonical.replyToIdFull !== undefined) {
    context.replyToIdFull = canonical.replyToIdFull;
  }
  if (canonical.replyToBody !== undefined) {
    context.replyToBody = canonical.replyToBody;
  }
  if (canonical.replyToSender !== undefined) {
    context.replyToSender = canonical.replyToSender;
  }
  if (canonical.replyToIsQuote !== undefined) {
    context.replyToIsQuote = canonical.replyToIsQuote;
  }
  assignTraceFields(context, canonical.trace);
  return context;
}

export function toPluginInboundClaimEvent(
  canonical: CanonicalInboundMessageHookContext,
  extras?: {
    commandAuthorized?: boolean;
    wasMentioned?: boolean;
  },
): PluginHookInboundClaimEvent {
  const context = toPluginInboundClaimContext(canonical);
  const event: PluginHookInboundClaimEvent = {
    content: canonical.content,
    body: canonical.body,
    bodyForAgent: canonical.bodyForAgent,
    transcript: canonical.transcript,
    timestamp: canonical.timestamp,
    channel: canonical.channelId,
    accountId: canonical.accountId,
    conversationId: context.conversationId,
    parentConversationId: context.parentConversationId,
    senderId: canonical.senderId,
    senderName: canonical.senderName,
    senderUsername: canonical.senderUsername,
    ...(canonical.replyToId !== undefined ? { replyToId: canonical.replyToId } : {}),
    ...(canonical.replyToIdFull !== undefined ? { replyToIdFull: canonical.replyToIdFull } : {}),
    ...(canonical.replyToBody !== undefined ? { replyToBody: canonical.replyToBody } : {}),
    ...(canonical.replyToSender !== undefined ? { replyToSender: canonical.replyToSender } : {}),
    ...(canonical.replyToIsQuote !== undefined ? { replyToIsQuote: canonical.replyToIsQuote } : {}),
    threadId: canonical.threadId,
    messageId: canonical.messageId,
    sessionKey: canonical.sessionKey,
    runId: canonical.runId,
    isGroup: canonical.isGroup,
    commandAuthorized: extras?.commandAuthorized,
    wasMentioned: extras?.wasMentioned,
    metadata: {
      from: canonical.from,
      to: canonical.to,
      provider: canonical.provider,
      surface: canonical.surface,
      originatingChannel: canonical.originatingChannel,
      originatingTo: canonical.originatingTo,
      senderE164: canonical.senderE164,
      replyToId: canonical.replyToId,
      replyToIdFull: canonical.replyToIdFull,
      replyToBody: canonical.replyToBody,
      replyToSender: canonical.replyToSender,
      replyToIsQuote: canonical.replyToIsQuote,
      mediaPath: canonical.mediaPath,
      mediaUrl: canonical.mediaUrl,
      mediaType: canonical.mediaType,
      mediaPaths: canonical.mediaPaths,
      mediaUrls: canonical.mediaUrls,
      mediaTypes: canonical.mediaTypes,
      guildId: canonical.guildId,
      channelName: canonical.channelName,
      groupId: canonical.groupId,
      topicName: canonical.topicName,
    },
  };
  assignTraceFields(event, canonical.trace);
  return event;
}

export function toPluginMessageReceivedEvent(
  canonical: CanonicalInboundMessageHookContext,
): PluginHookMessageReceivedEvent {
  const event: PluginHookMessageReceivedEvent = {
    from: canonical.from,
    content: canonical.content,
    timestamp: canonical.timestamp,
    threadId: canonical.threadId,
    messageId: canonical.messageId,
    senderId: canonical.senderId,
    ...(canonical.replyToId !== undefined ? { replyToId: canonical.replyToId } : {}),
    ...(canonical.replyToIdFull !== undefined ? { replyToIdFull: canonical.replyToIdFull } : {}),
    ...(canonical.replyToBody !== undefined ? { replyToBody: canonical.replyToBody } : {}),
    ...(canonical.replyToSender !== undefined ? { replyToSender: canonical.replyToSender } : {}),
    ...(canonical.replyToIsQuote !== undefined ? { replyToIsQuote: canonical.replyToIsQuote } : {}),
    sessionKey: canonical.sessionKey,
    runId: canonical.runId,
    metadata: {
      to: canonical.to,
      provider: canonical.provider,
      surface: canonical.surface,
      threadId: canonical.threadId,
      originatingChannel: canonical.originatingChannel,
      originatingTo: canonical.originatingTo,
      messageId: canonical.messageId,
      senderId: canonical.senderId,
      senderName: canonical.senderName,
      senderUsername: canonical.senderUsername,
      senderE164: canonical.senderE164,
      replyToId: canonical.replyToId,
      replyToIdFull: canonical.replyToIdFull,
      replyToBody: canonical.replyToBody,
      replyToSender: canonical.replyToSender,
      replyToIsQuote: canonical.replyToIsQuote,
      mediaPath: canonical.mediaPath,
      mediaUrl: canonical.mediaUrl,
      mediaType: canonical.mediaType,
      mediaPaths: canonical.mediaPaths,
      mediaUrls: canonical.mediaUrls,
      mediaTypes: canonical.mediaTypes,
      guildId: canonical.guildId,
      channelName: canonical.channelName,
      topicName: canonical.topicName,
    },
  };
  assignTraceFields(event, canonical.trace);
  return event;
}

export function toPluginMessageSentEvent(
  canonical: CanonicalSentMessageHookContext,
): PluginHookMessageSentEvent {
  const event: PluginHookMessageSentEvent = {
    to: canonical.to,
    content: canonical.content,
    success: canonical.success,
    ...(canonical.messageId ? { messageId: canonical.messageId } : {}),
    ...(canonical.sessionKey ? { sessionKey: canonical.sessionKey } : {}),
    ...(canonical.runId ? { runId: canonical.runId } : {}),
    ...(canonical.error ? { error: canonical.error } : {}),
  };
  assignTraceFields(event, canonical.trace);
  return event;
}

// ---------------------------------------------------------------------------
// Canonical -> Internal Hook 投影
// ---------------------------------------------------------------------------

export function toInternalMessageReceivedContext(
  canonical: CanonicalInboundMessageHookContext,
): MessageReceivedHookContext {
  return {
    from: canonical.from,
    content: canonical.content,
    timestamp: canonical.timestamp,
    channelId: canonical.channelId,
    accountId: canonical.accountId,
    conversationId: canonical.conversationId,
    messageId: canonical.messageId,
    metadata: {
      to: canonical.to,
      provider: canonical.provider,
      surface: canonical.surface,
      threadId: canonical.threadId,
      senderId: canonical.senderId,
      senderName: canonical.senderName,
      senderUsername: canonical.senderUsername,
      senderE164: canonical.senderE164,
      mediaPath: canonical.mediaPath,
      mediaUrl: canonical.mediaUrl,
      mediaType: canonical.mediaType,
      mediaPaths: canonical.mediaPaths,
      mediaUrls: canonical.mediaUrls,
      mediaTypes: canonical.mediaTypes,
      guildId: canonical.guildId,
      channelName: canonical.channelName,
      topicName: canonical.topicName,
    },
  };
}

/**
 * 转写为内部 `message:transcribed` 事件上下文。
 * 注意 cross-wms 的 `MessageTranscribedHookContext` 不含 `cfg`，这里以
 * `& { cfg: OpenClawConfig }` 形式附加 cfg 字段以保持 openclaw 行为。
 */
export function toInternalMessageTranscribedContext(
  canonical: CanonicalInboundMessageHookContext,
  cfg: OpenClawConfig,
): MessageTranscribedHookContext & { cfg: OpenClawConfig } {
  const shared = toInternalInboundMessageHookContextBase(canonical);
  return {
    ...shared,
    transcript: canonical.transcript ?? '',
    cfg,
  };
}

/**
 * 转写为内部 `message:preprocessed` 事件上下文。
 */
export function toInternalMessagePreprocessedContext(
  canonical: CanonicalInboundMessageHookContext,
  cfg: OpenClawConfig,
): MessagePreprocessedHookContext & { cfg: OpenClawConfig } {
  const shared = toInternalInboundMessageHookContextBase(canonical);
  return {
    ...shared,
    transcript: canonical.transcript,
    isGroup: canonical.isGroup,
    groupId: canonical.groupId,
    cfg,
  };
}

function toInternalInboundMessageHookContextBase(canonical: CanonicalInboundMessageHookContext) {
  return {
    from: canonical.from,
    to: canonical.to,
    body: canonical.body,
    bodyForAgent: canonical.bodyForAgent,
    timestamp: canonical.timestamp,
    channelId: canonical.channelId,
    conversationId: canonical.conversationId,
    messageId: canonical.messageId,
    senderId: canonical.senderId,
    senderName: canonical.senderName,
    senderUsername: canonical.senderUsername,
    provider: canonical.provider,
    surface: canonical.surface,
    mediaPath: canonical.mediaPath,
    mediaType: canonical.mediaType,
  };
}

export function toInternalMessageSentContext(
  canonical: CanonicalSentMessageHookContext,
): MessageSentHookContext {
  return {
    to: canonical.to,
    content: canonical.content,
    success: canonical.success,
    ...(canonical.error ? { error: canonical.error } : {}),
    channelId: canonical.channelId,
    accountId: canonical.accountId,
    conversationId: canonical.conversationId,
    messageId: canonical.messageId,
    ...(canonical.isGroup != null ? { isGroup: canonical.isGroup } : {}),
    ...(canonical.groupId ? { groupId: canonical.groupId } : {}),
  };
}

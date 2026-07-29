// 通道入站消息契约：定义插件 ingress 负载与回复分发元数据。
// openclaw 原始实现为 barrel 重导出，依赖 ../channels/inbound-event/**、
// ../auto-reply/**、../channels/mention-*.js 等未移植模块。此处提供最小可用类型与桩函数。

/** 入站事件类型。 */
export type InboundEventKind =
  | "message"
  | "command"
  | "reaction"
  | "mention"
  | "join"
  | "leave"
  | "edit"
  | "delete"
  | "unknown";

/** @deprecated 使用 InboundEventKind。历史别名。 */
export type InboundTurnKind = InboundEventKind;

/** 入站提及事实。 */
export type InboundMentionFacts = {
  /** 是否显式提及。 */
  explicit: boolean;
  /** 是否隐式提及。 */
  implicit: boolean;
  /** 匹配的提及文本。 */
  matchedText?: string;
};

/** 隐式提及类型。 */
export type InboundImplicitMentionKind = "none" | "reply" | "active-session" | "recent";

/** 入站提及策略。 */
export type InboundMentionPolicy = {
  /** 是否要求显式提及。 */
  requireExplicit?: boolean;
  /** 是否允许隐式提及。 */
  allowImplicit?: boolean;
};

/** 入站提及决策。 */
export type InboundMentionDecision = {
  shouldRespond: boolean;
  reason: string;
};

/** 提及门控参数。 */
export type MentionGateParams = {
  facts: InboundMentionFacts;
  policy: InboundMentionPolicy;
};

/** 提及门控结果。 */
export type MentionGateResult = InboundMentionDecision;

/** 带旁路的提及门控参数。 */
export type MentionGateWithBypassParams = MentionGateParams & {
  bypass?: boolean;
};

/** 带旁路的提及门控结果。 */
export type MentionGateWithBypassResult = MentionGateResult;

/** 解析入站提及决策的扁平参数。 */
export type ResolveInboundMentionDecisionFlatParams = MentionGateParams;

/** 解析入站提及决策的嵌套参数。 */
export type ResolveInboundMentionDecisionNestedParams = MentionGateParams;

/** 解析入站提及决策的参数。 */
export type ResolveInboundMentionDecisionParams = MentionGateParams;

/** 信封格式选项。 */
export type EnvelopeFormatOptions = {
  /** 是否包含时间戳。 */
  includeTimestamp?: boolean;
  /** 是否包含发送者标签。 */
  includeFromLabel?: boolean;
};

/** 插件钩子渠道聊天上下文。 */
export type PluginHookChannelChatContext = {
  channelId: string;
  messageId?: string;
  text?: string;
};

/** 插件钩子渠道上下文。 */
export type PluginHookChannelContext = PluginHookChannelChatContext & {
  sender?: PluginHookChannelSenderContext;
};

/** 插件钩子渠道发送者上下文。 */
export type PluginHookChannelSenderContext = {
  id: string;
  name?: string;
};

/** 位置来源。 */
export type LocationSource = "gps" | "manual" | "venue" | "unknown";

/** 规范化位置。 */
export type NormalizedLocation = {
  latitude?: number;
  longitude?: number;
  source: LocationSource;
  label?: string;
};

/** 日志函数。 */
export type LogFn = (message: string, ...args: unknown[]) => void;

/** 命令事实。 */
export type CommandFacts = {
  isCommand: boolean;
  isNativeCommand: boolean;
  isTextSlashCommand: boolean;
  isAuthorized: boolean;
};

/** 入站媒体事实。 */
export type InboundMediaFacts = {
  hasMedia: boolean;
  mediaCount: number;
  mediaKinds: string[];
};

/** 补充上下文事实。 */
export type SupplementalContextFacts = {
  hasQuote: boolean;
  hasSupplemental: boolean;
};

/** 命令回合上下文。 */
export type CommandTurnContext = {
  command: string;
  args: string[];
  isNative: boolean;
};

/** 入站媒体输入。 */
export type ChannelInboundMediaInput = {
  /** 媒体类型。 */
  kind: string;
  /** 媒体 URL 或数据。 */
  url?: string;
  /** 媒体二进制数据。 */
  data?: Uint8Array;
  /** MIME 类型。 */
  mimeType?: string;
};

/** @deprecated 使用 ChannelInboundMediaInput。 */
export type ChannelTurnMediaInput = ChannelInboundMediaInput;

/** 入站媒体负载。 */
export type ChannelInboundMediaPayload = {
  inputs: ChannelInboundMediaInput[];
};

/** @deprecated 使用 ChannelInboundMediaPayload。 */
export type ChannelTurnMediaPayload = ChannelInboundMediaPayload;

/** 构建入站事件上下文的参数。 */
export type BuildChannelInboundEventContextParams = {
  message: {
    channelId: string;
    senderId: string;
    text?: string;
    inboundEventKind?: InboundEventKind;
  };
};

/** 构建入站事件上下文的异步参数。 */
export type BuildChannelInboundEventContextAsyncParams = BuildChannelInboundEventContextParams & {
  resolveSupplementalMedia?: boolean;
};

/** 构建完成的入站事件上下文。 */
export type BuiltChannelInboundEventContext = {
  channelId: string;
  senderId: string;
  InboundEventKind: InboundEventKind;
  media?: ChannelInboundMediaPayload;
};

/** 入站补充上下文解析选项。 */
export type ChannelInboundSupplementalResolutionOptions = {
  resolveMedia?: boolean;
};

/** 完成入站上下文的参数。 */
export type FinalizeChannelInboundContextParams = BuildChannelInboundEventContextParams;

/** 完成入站上下文的异步参数。 */
export type FinalizeChannelInboundContextAsyncParams = FinalizeChannelInboundContextParams;

/** 完成入站上下文的结果。 */
export type FinalizeChannelInboundContextResult = BuiltChannelInboundEventContext;

/** 装配好的入站回复。 */
export type AssembledInboundReply = {
  text: string;
  media?: ChannelInboundMediaPayload;
};

/** 渠道机器人循环保护事实。 */
export type ChannelBotLoopProtectionFacts = {
  consecutiveBotReplies: number;
  suppressionThreshold: number;
};

/** 渠道入站事件运行器参数。 */
export type ChannelInboundEventRunnerParams = {
  context: BuiltChannelInboundEventContext;
};

/** 渠道入站丢弃历史选项。 */
export type ChannelInboundDroppedHistoryOptions = {
  maxEntries?: number;
};

/** 准备好的入站回复。 */
export type PreparedInboundReply = {
  text: string;
  replyToMessageId?: string;
};

/** 入站回复分发结果。 */
export type InboundReplyDispatchResult = {
  dispatched: boolean;
  messageId?: string;
};

/** 入站回复记录选项。 */
export type InboundReplyRecordOptions = {
  recordHistory?: boolean;
};

/** @deprecated 使用 BuildChannelInboundEventContextParams。 */
export type BuildChannelTurnContextParams = Omit<BuildChannelInboundEventContextParams, "message"> & {
  message: BuildChannelInboundEventContextParams["message"] & {
    inboundTurnKind?: InboundEventKind;
  };
};

/** @deprecated 使用 BuiltChannelInboundEventContext。 */
export type BuiltChannelTurnContext = BuiltChannelInboundEventContext & {
  InboundTurnKind: InboundEventKind;
};

/** 分类入站事件参数。 */
export type ClassifyChannelInboundEventParams = {
  text?: string;
  hasMedia?: boolean;
  isMention?: boolean;
};

// ---- 入站事件上下文构建 ----

// TODO: 依赖模块未移植，暂用本地桩
export function buildChannelInboundEventContext(
  params: BuildChannelInboundEventContextParams,
): BuiltChannelInboundEventContext {
  return {
    channelId: params.message.channelId,
    senderId: params.message.senderId,
    InboundEventKind: params.message.inboundEventKind ?? "message",
  };
}

// TODO: 依赖模块未移植，暂用本地桩
export function finalizeChannelInboundContext(
  params: FinalizeChannelInboundContextParams,
): FinalizeChannelInboundContextResult {
  return buildChannelInboundEventContext(params);
}

// TODO: 依赖模块未移植，暂用本地桩
export function filterChannelInboundQuoteContext<T>(items: T[]): T[] {
  return items;
}

// TODO: 依赖模块未移植，暂用本地桩
export function filterChannelInboundSupplementalContext<T>(items: T[]): T[] {
  return items;
}

// TODO: 依赖模块未移植，暂用本地桩
export function resolveChannelInboundSupplementalContext(
  _params: unknown,
  _options?: ChannelInboundSupplementalResolutionOptions,
): unknown {
  return undefined;
}

/** @deprecated 使用 buildChannelInboundEventContext。 */
export function buildChannelTurnContext(
  params: BuildChannelTurnContextParams,
): BuiltChannelTurnContext {
  const inboundEventKind = params.message.inboundEventKind ?? params.message.inboundTurnKind;
  const ctx = buildChannelInboundEventContext({
    ...params,
    message: {
      ...params.message,
      ...(inboundEventKind ? { inboundEventKind } : {}),
    },
  });
  return { ...ctx, InboundTurnKind: ctx.InboundEventKind };
}

/** @deprecated 使用 filterChannelInboundSupplementalContext。 */
export const filterChannelTurnSupplementalContext = filterChannelInboundSupplementalContext;

// ---- 提及匹配 ----

/** 构建提及正则的选项。 */
export type BuildMentionRegexesOptions = {
  /** 机器人显示名称。 */
  botName?: string;
  /** 机器人 ID。 */
  botId?: string;
  /** 自定义提及模式。 */
  customPatterns?: string[];
};

// TODO: 依赖模块未移植，暂用本地桩
export function buildMentionRegexes(options?: BuildMentionRegexesOptions): RegExp[] {
  const patterns: RegExp[] = [];
  if (options?.botName) {
    patterns.push(new RegExp(`@${escapeRegExp(options.botName)}`, "i"));
  }
  if (options?.botId) {
    patterns.push(new RegExp(`@${escapeRegExp(options.botId)}`, "i"));
  }
  return patterns;
}

// TODO: 依赖模块未移植，暂用本地桩
export function matchesMentionPatterns(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

// TODO: 依赖模块未移植，暂用本地桩
export function matchesMentionWithExplicit(
  text: string,
  patterns: RegExp[],
  explicit?: boolean,
): boolean {
  return explicit || matchesMentionPatterns(text, patterns);
}

// TODO: 依赖模块未移植，暂用本地桩
export function normalizeMentionText(text: string): string {
  return text.trim().toLowerCase();
}

// ---- 提及门控 ----

// TODO: 依赖模块未移植，暂用本地桩
export function resolveInboundMentionDecision(
  params: ResolveInboundMentionDecisionParams,
): InboundMentionDecision {
  const { facts, policy } = params;
  if (facts.explicit) return { shouldRespond: true, reason: "explicit-mention" };
  if (policy.allowImplicit && facts.implicit) {
    return { shouldRespond: true, reason: "implicit-mention" };
  }
  if (policy.requireExplicit) {
    return { shouldRespond: false, reason: "requires-explicit-mention" };
  }
  return { shouldRespond: true, reason: "no-mention-policy" };
}

/** @deprecated 使用 resolveInboundMentionDecision。 */
export const resolveMentionGating = resolveInboundMentionDecision;

/** @deprecated 使用 resolveInboundMentionDecision。 */
export function resolveMentionGatingWithBypass(
  params: MentionGateWithBypassParams,
): MentionGateWithBypassResult {
  if (params.bypass) return { shouldRespond: true, reason: "bypass" };
  return resolveInboundMentionDecision(params);
}

// TODO: 依赖模块未移植，暂用本地桩
export function implicitMentionKindWhen(_facts: InboundMentionFacts): InboundImplicitMentionKind {
  return "none";
}

// ---- 提及模式策略 ----

/** 解析提及模式策略参数。 */
export type ResolveMentionPatternPolicyParams = {
  patterns?: string[];
  botName?: string;
};

/** 解析后的提及模式策略。 */
export type ResolvedMentionPatternPolicy = {
  patterns: RegExp[];
  requireExplicit: boolean;
};

// TODO: 依赖模块未移植，暂用本地桩
export function resolveMentionPatternPolicy(
  params: ResolveMentionPatternPolicyParams,
): ResolvedMentionPatternPolicy {
  return {
    patterns: buildMentionRegexes({ botName: params.botName, customPatterns: params.patterns }),
    requireExplicit: false,
  };
}

// ---- 信封格式化 ----

// TODO: 依赖模块未移植，暂用本地桩
export function formatInboundEnvelope(
  text: string,
  _options?: EnvelopeFormatOptions,
): string {
  return text;
}

// TODO: 依赖模块未移植，暂用本地桩
export function formatInboundFromLabel(name: string): string {
  return name;
}

// TODO: 依赖模块未移植，暂用本地桩
export function resolveEnvelopeFormatOptions(_input?: unknown): EnvelopeFormatOptions {
  return {};
}

// ---- 入站去抖 ----

// TODO: 依赖模块未移植，暂用本地桩
export function resolveInboundDebounceMs(_input?: unknown): number {
  return 0;
}

/** 入站去抖器。 */
export type InboundDebouncer = {
  debounce(key: string, fn: () => void, ms?: number): void;
  cancel(key: string): void;
  flush(key: string): void;
};

// TODO: 依赖模块未移植，暂用本地桩
export function createInboundDebouncer(): InboundDebouncer {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  return {
    debounce(key, fn, ms = 0) {
      this.cancel(key);
      timers.set(key, setTimeout(() => {
        timers.delete(key);
        fn();
      }, ms));
    },
    cancel(key) {
      const timer = timers.get(key);
      if (timer) {
        clearTimeout(timer);
        timers.delete(key);
      }
    },
    flush(key) {
      const timer = timers.get(key);
      if (timer) {
        clearTimeout(timer);
        timers.delete(key);
      }
    },
  };
}

// TODO: 依赖模块未移植，暂用本地桩
export function createChannelInboundDebouncer(): InboundDebouncer {
  return createInboundDebouncer();
}

// TODO: 依赖模块未移植，暂用本地桩
export function shouldDebounceTextInbound(_text: string): boolean {
  return false;
}

// ---- 位置 ----

// TODO: 依赖模块未移植，暂用本地桩
export function formatLocationText(location: NormalizedLocation): string {
  const parts: string[] = [];
  if (location.label) parts.push(location.label);
  if (location.latitude !== undefined && location.longitude !== undefined) {
    parts.push(`${location.latitude},${location.longitude}`);
  }
  return parts.join(" ");
}

// TODO: 依赖模块未移植，暂用本地桩
export function toLocationContext(location: NormalizedLocation): Record<string, unknown> {
  return { ...location };
}

// ---- 日志 ----

// TODO: 依赖模块未移植，暂用本地桩
export function logInboundDrop(_channelId: string, _reason: string, _log?: LogFn): void {
  _log?.(`Inbound dropped: ${_reason}`);
}

// ---- 会话信封 ----

// TODO: 依赖模块未移植，暂用本地桩
export function resolveInboundSessionEnvelopeContext(_input: unknown): unknown {
  return undefined;
}

// ---- 入站事件分类 ----

// TODO: 依赖模块未移植，暂用本地桩
export function classifyChannelInboundEvent(
  params: ClassifyChannelInboundEventParams,
): InboundEventKind {
  if (params.text?.startsWith("/")) return "command";
  if (params.isMention) return "mention";
  return "message";
}

// TODO: 依赖模块未移植，暂用本地桩
export function resolveUnmentionedGroupInboundPolicy(): { ignore: boolean } {
  return { ignore: false };
}

// ---- 入站回复分发 ----

// TODO: 依赖模块未移植，暂用本地桩
export async function runChannelInboundEvent(
  _params: ChannelInboundEventRunnerParams,
): Promise<InboundReplyDispatchResult> {
  return { dispatched: false };
}

// TODO: 依赖模块未移植，暂用本地桩
export async function runPreparedInboundReply(
  _reply: PreparedInboundReply,
): Promise<InboundReplyDispatchResult> {
  return { dispatched: false };
}

// TODO: 依赖模块未移植，暂用本地桩
export async function dispatchChannelInboundReply(
  _reply: PreparedInboundReply,
): Promise<InboundReplyDispatchResult> {
  return { dispatched: false };
}

// TODO: 依赖模块未移植，暂用本地桩
export function recordDroppedChannelInboundHistory(
  _channelId: string,
  _options?: ChannelInboundDroppedHistoryOptions,
): void {}

// TODO: 依赖模块未移植，暂用本地桩
export async function dispatchReplyFromConfigWithSettledDispatcher(
  _input: unknown,
): Promise<InboundReplyDispatchResult> {
  return { dispatched: false };
}

// TODO: 依赖模块未移植，暂用本地桩
export function hasFinalInboundReplyDispatch(_result: InboundReplyDispatchResult): boolean {
  return false;
}

// TODO: 依赖模块未移植，暂用本地桩
export function hasVisibleInboundReplyDispatch(_result: InboundReplyDispatchResult): boolean {
  return false;
}

// TODO: 依赖模块未移植，暂用本地桩
export function recordChannelBotPairLoopAndCheckSuppression(
  _facts: ChannelBotLoopProtectionFacts,
): boolean {
  return false;
}

// TODO: 依赖模块未移植，暂用本地桩
export function resolveInboundReplyDispatchCounts(_input: unknown): { final: number; visible: number } {
  return { final: 0, visible: 0 };
}

// ---- 入站媒体 ----

// TODO: 依赖模块未移植，暂用本地桩
export function toHistoryMediaEntries(_input: unknown): unknown[] {
  return [];
}

// TODO: 依赖模块未移植，暂用本地桩
export function toInboundMediaFacts(_input: unknown): InboundMediaFacts {
  return { hasMedia: false, mediaCount: 0, mediaKinds: [] };
}

// TODO: 依赖模块未移植，暂用本地桩
export function buildChannelInboundMediaPayload(
  _inputs: ChannelInboundMediaInput[],
): ChannelInboundMediaPayload {
  return { inputs: [] };
}

/** @deprecated 使用 buildChannelInboundMediaPayload。 */
export const buildChannelTurnMediaPayload = buildChannelInboundMediaPayload;

// ---- 命令回合上下文 ----

// TODO: 依赖模块未移植，暂用本地桩
export function createCommandTurnContext(text: string): CommandTurnContext {
  const parts = text.split(/\s+/);
  return { command: parts[0] ?? "", args: parts.slice(1), isNative: text.startsWith("/") };
}

// TODO: 依赖模块未移植，暂用本地桩
export function isAuthorizedTextSlashCommandTurn(_text: string): boolean {
  return false;
}

// TODO: 依赖模块未移植，暂用本地桩
export function isExplicitCommandTurn(text: string): boolean {
  return text.startsWith("/");
}

// TODO: 依赖模块未移植，暂用本地桩
export function isNativeCommandTurn(text: string): boolean {
  return text.startsWith("/");
}

// TODO: 依赖模块未移植，暂用本地桩
export function isTextSlashCommandTurn(text: string): boolean {
  return text.startsWith("/");
}

// ---- Direct DM ----

/** Direct DM 鉴权运行时。 */
export type DirectDmCommandAuthorizationRuntime = unknown;

/** Direct DM 预加密守卫策略。 */
export type DirectDmPreCryptoGuardPolicy = {
  authorize?: (input: unknown) => boolean;
};

/** Direct DM 预加密守卫策略覆盖。 */
export type DirectDmPreCryptoGuardPolicyOverrides = Partial<DirectDmPreCryptoGuardPolicy>;

/** 访问组成员解析器。 */
export type AccessGroupMembershipResolver = (userId: string, groupId: string) => Promise<boolean>;

/** 解析后的入站 Direct DM 访问。 */
export type ResolvedInboundDirectDmAccess = {
  authorized: boolean;
  reason?: string;
};

// TODO: 依赖模块未移植，暂用本地桩
export function createDirectDmPreCryptoGuardPolicy(
  _overrides?: DirectDmPreCryptoGuardPolicyOverrides,
): DirectDmPreCryptoGuardPolicy {
  return { authorize: () => true };
}

// TODO: 依赖模块未移植，暂用本地桩
export function createPreCryptoDirectDmAuthorizer(_policy?: DirectDmPreCryptoGuardPolicy): unknown {
  return {};
}

// TODO: 依赖模块未移植，暂用本地桩
export async function dispatchInboundDirectDmWithRuntime(_input: unknown): Promise<unknown> {
  return undefined;
}

// TODO: 依赖模块未移植，暂用本地桩
export async function resolveInboundDirectDmAccessWithRuntime(
  _input: unknown,
): Promise<ResolvedInboundDirectDmAccess> {
  return { authorized: true };
}

// ---- 入站路径根 ----

// TODO: 依赖模块未移植，暂用本地桩
export function mergeInboundPathRoots(..._roots: unknown[][]): unknown[] {
  return [];
}

// ---- 辅助 ----

/** 转义正则特殊字符。 */
function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

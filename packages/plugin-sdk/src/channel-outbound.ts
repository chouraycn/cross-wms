// 通道出站契约：定义插件发送结果、媒体处理与交付元数据。
// openclaw 原始实现为 barrel 重导出 + 懒加载转发，依赖 ../channels/message/**、
// ../channels/turn/kernel.js、../infra/outbound/**、../channels/streaming.js 等未移植模块。
// 此处提供最小可用类型与桩函数。

/** 持久化入站回复投递选项。 */
export type DurableInboundReplyDeliveryOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
};

/** 持久化入站回复投递参数。 */
export type DurableInboundReplyDeliveryParams = {
  context: unknown;
  options?: DurableInboundReplyDeliveryOptions;
};

/** 持久化入站回复投递结果。 */
export type DurableInboundReplyDeliveryResult = {
  delivered: boolean;
  messageId?: string;
  error?: string;
};

/** 持久化消息发送意图。 */
export type DurableMessageSendIntent = "send" | "edit" | "delete" | "reply";

/** 持久化消息发送状态。 */
export type DurableMessageSendState = "pending" | "sent" | "failed" | "cancelled";

/** 持久化消息发送上下文参数。 */
export type DurableMessageSendContextParams = {
  channelId: string;
  accountId?: string;
  intent?: DurableMessageSendIntent;
};

/** 持久化消息发送上下文。 */
export type DurableMessageSendContext = DurableMessageSendContextParams & {
  state: DurableMessageSendState;
};

/** 持久化消息批量发送参数。 */
export type DurableMessageBatchSendParams = {
  context: DurableMessageSendContextParams;
  messages: Array<{ text: string; media?: unknown }>;
};

/** 持久化消息批量发送结果。 */
export type DurableMessageBatchSendResult = {
  results: Array<{ success: boolean; messageId?: string; error?: string }>;
};

/** 出站会话上下文。 */
export type OutboundSessionContext = {
  channelId: string;
  sessionId?: string;
  replyToMessageId?: string;
};

/** 出站投递格式化选项。 */
export type OutboundDeliveryFormattingOptions = {
  plainText?: boolean;
  maxLength?: number;
};

/** 出站身份。 */
export type OutboundIdentity = {
  agentId: string;
  displayName?: string;
};

/** 回复目标解析。 */
export type ReplyToResolution = {
  replyToMessageId?: string;
  replyToUserId?: string;
};

/** 出站发送依赖。 */
export type OutboundSendDeps = {
  send?: (payload: unknown) => Promise<unknown>;
};

/** 可最终化草稿流状态。 */
export type FinalizableDraftStreamState = "idle" | "streaming" | "finalizing" | "finalized" | "cancelled";

/** 草稿流循环。 */
export type DraftStreamLoop = {
  start(): Promise<void>;
  stop(): Promise<void>;
};

/** 渠道草稿流分块配置。 */
export type ChannelDraftStreamingChunking = {
  chunkSize?: number;
  delayMs?: number;
};

/** 渠道运行队列。 */
export type ChannelRunQueue<T = unknown> = {
  enqueue(task: T): void;
  drain(): Promise<void>;
};

/** 渠道运行队列参数。 */
export type ChannelRunQueueParams = {
  concurrency?: number;
};

/** 渠道运行队列任务上下文。 */
export type ChannelRunQueueTaskContext = {
  signal?: AbortSignal;
};

/** 渠道进度草稿合成器。 */
export type ChannelProgressDraftCompositor = {
  update(line: ChannelProgressDraftCompositorLine): void;
  finalize(): string;
};

/** 渠道进度草稿合成器行。 */
export type ChannelProgressDraftCompositorLine = {
  text: string;
  done?: boolean;
};

/** 渠道进度草稿模式。 */
export type ChannelProgressDraftMode = "append" | "replace";

/** 渠道进度草稿更新选项。 */
export type ChannelProgressDraftUpdateOptions = {
  mode?: ChannelProgressDraftMode;
};

/** 消息回执。 */
export type MessageReceipt = {
  messageId: string;
  platformId?: string;
  parts?: MessageReceiptPart[];
};

/** 消息回执部分。 */
export type MessageReceiptPart = {
  kind: MessageReceiptPartKind;
  messageId?: string;
};

/** 消息回执部分类型。 */
export type MessageReceiptPartKind = "text" | "media" | "unknown";

/** 消息回执来源结果。 */
export type MessageReceiptSourceResult = {
  success: boolean;
  receipt?: MessageReceipt;
};

/** 消息接收上下文。 */
export type MessageReceiveContext = {
  channelId: string;
  messageId: string;
};

/** 消息发送上下文。 */
export type MessageSendContext = DurableMessageSendContext;

/** 消息持久化策略。 */
export type MessageDurabilityPolicy = "durable" | "ephemeral" | "auto";

/** 消息 ACK 策略。 */
export type MessageAckPolicy = "none" | "after-stage" | "after-final";

/** 消息 ACK 阶段。 */
export type MessageAckStage = "received" | "processed" | "sent" | "final";

/** 消息 ACK 状态。 */
export type MessageAckState = "pending" | "acked" | "failed";

/** 渲染消息批次。 */
export type RenderedMessageBatch = {
  messages: Array<{ text: string; media?: unknown }>;
};

/** 渲染消息批次计划。 */
export type RenderedMessageBatchPlan = {
  items: RenderedMessageBatchPlanItem[];
};

/** 渲染消息批次计划项。 */
export type RenderedMessageBatchPlanItem = {
  kind: RenderedMessageBatchPlanKind;
  text?: string;
  media?: unknown;
};

/** 渲染消息批次计划类型。 */
export type RenderedMessageBatchPlanKind = "text" | "media" | "mixed";

/** 持久化消息状态记录。 */
export type DurableMessageStateRecord = {
  intent: DurableMessageSendIntent;
  state: DurableMessageSendState;
  messageId?: string;
  updatedAt: number;
};

/** 实时消息阶段。 */
export type LiveMessagePhase = "preview" | "finalizing" | "finalized" | "cancelled";

/** 实时消息状态。 */
export type LiveMessageState = {
  phase: LiveMessagePhase;
  messageId?: string;
  previewText?: string;
};

/** 可最终化实时预览适配器。 */
export type FinalizableLivePreviewAdapter = {
  updatePreview(text: string): Promise<void>;
  finalize(): Promise<MessageReceipt>;
  cancel(): Promise<void>;
};

/** 实时预览最终化器结果类型。 */
export type LivePreviewFinalizerResultKind = "success" | "cancelled" | "failed";

/** 实时预览最终化器结果。 */
export type LivePreviewFinalizerResult = {
  kind: LivePreviewFinalizerResultKind;
  receipt?: MessageReceipt;
};

// ---- 渠道消息适配器类型 ----

/** 渠道消息适配器。 */
export type ChannelMessageAdapter = unknown;

/** 渠道消息适配器形状。 */
export type ChannelMessageAdapterShape = unknown;

/** 渠道消息持久化最终适配器。 */
export type ChannelMessageDurableFinalAdapter = unknown;

/** 渠道消息发送适配器。 */
export type ChannelMessageSendAdapter = unknown;

/** 创建渠道回复管道参数。 */
export type CreateChannelReplyPipelineParams = {
  channelId: string;
};

/** 渠道入口队列。 */
export type ChannelIngressQueue = unknown;

/** 渠道入口队列认领。 */
export type ChannelIngressQueueClaim = unknown;

// ---- 出站发送辅助 ----

/** 创建回复前缀上下文。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createReplyPrefixContext(_input?: unknown): Record<string, unknown> {
  return {};
}

/** 创建回复前缀选项。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createReplyPrefixOptions(_input?: unknown): Record<string, unknown> {
  return {};
}

/** 创建输入指示回调。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createTypingCallbacks(_input?: unknown): { onStart(): void; onStop(): void } {
  return { onStart() {}, onStop() {} };
}

/** 创建渠道回复管道。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createChannelReplyPipeline(_params: CreateChannelReplyPipelineParams): unknown {
  return {};
}

/** 创建渠道消息回复管道（别名）。 */
export const createChannelMessageReplyPipeline = createChannelReplyPipeline;

/** 解析渠道源回复投递模式。 */
// TODO: 依赖模块未移植，暂用本地桩
export function resolveChannelSourceReplyDeliveryMode(_input?: unknown): string {
  return "default";
}

/** 解析渠道消息源回复投递模式（别名）。 */
export const resolveChannelMessageSourceReplyDeliveryMode = resolveChannelSourceReplyDeliveryMode;

// ---- 草稿流控制 ----

/** 创建可最终化草稿生命周期。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createFinalizableDraftLifecycle(): {
  state: FinalizableDraftStreamState;
  start(): void;
  finalize(): void;
  cancel(): void;
} {
  let state: FinalizableDraftStreamState = "idle";
  return {
    get state() {
      return state;
    },
    start() {
      state = "streaming";
    },
    finalize() {
      state = "finalized";
    },
    cancel() {
      state = "cancelled";
    },
  };
}

/** 创建可最终化草稿流控制。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createFinalizableDraftStreamControls(): unknown {
  return createFinalizableDraftLifecycle();
}

/** 为状态创建可最终化草稿流控制。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createFinalizableDraftStreamControlsForState(_state: FinalizableDraftStreamState): unknown {
  return createFinalizableDraftLifecycle();
}

/** 清除可最终化草稿消息。 */
// TODO: 依赖模块未移植，暂用本地桩
export function clearFinalizableDraftMessage(_input?: unknown): void {}

/** 在停止后取走消息 ID。 */
// TODO: 依赖模块未移植，暂用本地桩
export function takeMessageIdAfterStop(_input?: unknown): string | undefined {
  return undefined;
}

/** 创建草稿流循环。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createDraftStreamLoop(): DraftStreamLoop {
  return {
    async start() {},
    async stop() {},
  };
}

/** 解析渠道草稿流分块。 */
// TODO: 依赖模块未移植，暂用本地桩
export function resolveChannelDraftStreamingChunking(_input?: unknown): ChannelDraftStreamingChunking {
  return { chunkSize: 1000, delayMs: 500 };
}

// ---- 运行队列与生命周期 ----

/** 创建渠道运行队列。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createChannelRunQueue<T = unknown>(_params?: ChannelRunQueueParams): ChannelRunQueue<T> {
  const tasks: T[] = [];
  return {
    enqueue(task) {
      tasks.push(task);
    },
    async drain() {
      tasks.length = 0;
    },
  };
}

/** 创建账号状态接收器。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createAccountStatusSink(): { update(state: unknown): void; snapshot(): unknown } {
  let current: unknown = undefined;
  return {
    update(state) {
      current = state;
    },
    snapshot() {
      return current;
    },
  };
}

/** 保持 HTTP 服务器任务存活。 */
// TODO: 依赖模块未移植，暂用本地桩
export async function keepHttpServerTaskAlive(_input?: unknown): Promise<void> {}

/** 运行被动账号生命周期。 */
// TODO: 依赖模块未移植，暂用本地桩
export async function runPassiveAccountLifecycle(_input?: unknown): Promise<void> {}

/** 等待中断。 */
// TODO: 依赖模块未移植，暂用本地桩
export async function waitUntilAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}

// ---- 出站负载 ----

/** 创建出站负载计划。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createOutboundPayloadPlan(_input?: unknown): unknown {
  return {};
}

/** 为投递投影出站负载计划。 */
// TODO: 依赖模块未移植，暂用本地桩
export function projectOutboundPayloadPlanForDelivery(_input?: unknown): unknown {
  return {};
}

/** 构建出站会话上下文。 */
// TODO: 依赖模块未移植，暂用本地桩
export function buildOutboundSessionContext(input: {
  channelId: string;
  sessionId?: string;
  replyToMessageId?: string;
}): OutboundSessionContext {
  return input;
}

/** 解析 agent 出站身份。 */
// TODO: 依赖模块未移植，暂用本地桩
export function resolveAgentOutboundIdentity(agentId: string): OutboundIdentity {
  return { agentId };
}

/** 创建回复目标扇出。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createReplyToFanout(_input?: unknown): ReplyToResolution {
  return {};
}

/** 解析出站发送依赖。 */
// TODO: 依赖模块未移植，暂用本地桩
export function resolveOutboundSendDeps(_input?: unknown): OutboundSendDeps {
  return {};
}

/** 为纯文本进行清理。 */
// TODO: 依赖模块未移植，暂用本地桩
export function sanitizeForPlainText(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").trim();
}

// ---- 日志 ----

// TODO: 依赖模块未移植，暂用本地桩
export function logAckFailure(_channelId: string, _error: unknown): void {}

// TODO: 依赖模块未移植，暂用本地桩
export function logTypingFailure(_channelId: string, _error: unknown): void {}

// ---- 进度草稿合成器 ----

/** 创建渠道进度草稿合成器。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createChannelProgressDraftCompositor(
  _options?: ChannelProgressDraftUpdateOptions,
): ChannelProgressDraftCompositor {
  const lines: ChannelProgressDraftCompositorLine[] = [];
  return {
    update(line) {
      lines.push(line);
    },
    finalize() {
      return lines.map((l) => l.text).join("\n");
    },
  };
}

// ---- 持久化发送 ----

/** 懒加载转发入站回复投递。 */
// TODO: 依赖模块未移植，暂用本地桩
export async function deliverInboundReplyWithMessageSendContext(
  _context: unknown,
): Promise<DurableInboundReplyDeliveryResult> {
  return { delivered: false };
}

/** 发送持久化消息批次。 */
// TODO: 依赖模块未移植，暂用本地桩
export async function sendDurableMessageBatch(
  _params: DurableMessageBatchSendParams,
): Promise<DurableMessageBatchSendResult> {
  return { results: [] };
}

/** 在持久化消息发送上下文中运行工作。 */
// TODO: 依赖模块未移植，暂用本地桩
export async function withDurableMessageSendContext<T>(
  _params: DurableMessageSendContextParams,
  run: (ctx: DurableMessageSendContext) => Promise<T>,
): Promise<T> {
  return run({ ..._params, state: "pending" });
}

// ---- 消息回执辅助 ----

/** 从出站结果创建消息回执。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createMessageReceiptFromOutboundResults(_input?: unknown): MessageReceipt | undefined {
  return undefined;
}

/** 列出消息回执平台 ID。 */
// TODO: 依赖模块未移植，暂用本地桩
export function listMessageReceiptPlatformIds(_receipt?: MessageReceipt): string[] {
  return [];
}

/** 创建消息接收上下文。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createMessageReceiveContext(input: { channelId: string; messageId: string }): MessageReceiveContext {
  return input;
}

/** 创建预览消息回执。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createPreviewMessageReceipt(messageId: string): MessageReceipt {
  return { messageId };
}

/** 解析消息回执主 ID。 */
// TODO: 依赖模块未移植，暂用本地桩
export function resolveMessageReceiptPrimaryId(receipt?: MessageReceipt): string | undefined {
  return receipt?.messageId;
}

// ---- 实时消息状态 ----

/** 创建实时消息状态。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createLiveMessageState(): LiveMessageState {
  return { phase: "preview" };
}

/** 创建持久化消息状态记录。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createDurableMessageStateRecord(
  intent: DurableMessageSendIntent,
): DurableMessageStateRecord {
  return { intent, state: "pending", updatedAt: Date.now() };
}

/** 标记实时消息已取消。 */
// TODO: 依赖模块未移植，暂用本地桩
export function markLiveMessageCancelled(state: LiveMessageState): LiveMessageState {
  return { ...state, phase: "cancelled" };
}

/** 标记实时消息已最终化。 */
// TODO: 依赖模块未移植，暂用本地桩
export function markLiveMessageFinalized(state: LiveMessageState, messageId?: string): LiveMessageState {
  return { ...state, phase: "finalized", messageId };
}

/** 标记实时消息预览已更新。 */
// TODO: 依赖模块未移植，暂用本地桩
export function markLiveMessagePreviewUpdated(state: LiveMessageState, previewText: string): LiveMessageState {
  return { ...state, previewText };
}

// ---- 消息适配器 ----

/** 定义渠道消息适配器。 */
// TODO: 依赖模块未移植，暂用本地桩
export function defineChannelMessageAdapter(_input?: unknown): ChannelMessageAdapter {
  return {};
}

/** 定义可最终化实时预览适配器。 */
// TODO: 依赖模块未移植，暂用本地桩
export function defineFinalizableLivePreviewAdapter(_input?: unknown): FinalizableLivePreviewAdapter {
  return {
    async updatePreview() {},
    async finalize() {
      return { messageId: "" };
    },
    async cancel() {},
  };
}

/** 从出站创建渠道消息适配器。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createChannelMessageAdapterFromOutbound(_input?: unknown): ChannelMessageAdapter {
  return {};
}

/** 投递可最终化实时预览。 */
// TODO: 依赖模块未移植，暂用本地桩
export async function deliverFinalizableLivePreview(_input?: unknown): Promise<LivePreviewFinalizerResult> {
  return { kind: "success" };
}

/** 使用可最终化实时预览适配器投递。 */
// TODO: 依赖模块未移植，暂用本地桩
export async function deliverWithFinalizableLivePreviewAdapter(_input?: unknown): Promise<LivePreviewFinalizerResult> {
  return { kind: "success" };
}

// ---- 分类持久化发送恢复状态 ----

// TODO: 依赖模块未移植，暂用本地桩
export function classifyDurableSendRecoveryState(_input?: unknown): string {
  return "unknown";
}

// ---- 创建持久化入站接收日志 ----

/** 创建持久化入站接收日志。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createDurableInboundReceiveJournal(): unknown {
  return {};
}

/** 从队列创建持久化入站接收日志。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createDurableInboundReceiveJournalFromQueue(_input?: unknown): unknown {
  return {};
}

// ---- 能力验证桩 ----

// TODO: 依赖模块未移植，暂用本地桩
export function listDeclaredChannelMessageLiveCapabilities(_input?: unknown): string[] {
  return [];
}

// TODO: 依赖模块未移植，暂用本地桩
export function listDeclaredDurableFinalCapabilities(_input?: unknown): string[] {
  return [];
}

// TODO: 依赖模块未移植，暂用本地桩
export function listDeclaredLivePreviewFinalizerCapabilities(_input?: unknown): string[] {
  return [];
}

// TODO: 依赖模块未移植，暂用本地桩
export function listDeclaredReceiveAckPolicies(_input?: unknown): MessageAckPolicy[] {
  return [];
}

// TODO: 依赖模块未移植，暂用本地桩
export function shouldAckMessageAfterStage(_stage: MessageAckStage, _policy?: MessageAckPolicy): boolean {
  return false;
}

// TODO: 依赖模块未移植，暂用本地桩
export function verifyChannelMessageAdapterCapabilityProofs(_input?: unknown): boolean {
  return true;
}

// TODO: 依赖模块未移植，暂用本地桩
export function verifyChannelMessageLiveCapabilityAdapterProofs(_input?: unknown): boolean {
  return true;
}

// TODO: 依赖模块未移植，暂用本地桩
export function verifyChannelMessageLiveCapabilityProofs(_input?: unknown): boolean {
  return true;
}

// TODO: 依赖模块未移植，暂用本地桩
export function verifyChannelMessageLiveFinalizerProofs(_input?: unknown): boolean {
  return true;
}

// TODO: 依赖模块未移植，暂用本地桩
export function verifyChannelMessageReceiveAckPolicyAdapterProofs(_input?: unknown): boolean {
  return true;
}

// TODO: 依赖模块未移植，暂用本地桩
export function verifyChannelMessageReceiveAckPolicyProofs(_input?: unknown): boolean {
  return true;
}

// TODO: 依赖模块未移植，暂用本地桩
export function verifyDurableFinalCapabilityProofs(_input?: unknown): boolean {
  return true;
}

// TODO: 依赖模块未移植，暂用本地桩
export function verifyLivePreviewFinalizerCapabilityProofs(_input?: unknown): boolean {
  return true;
}

// TODO: 依赖模块未移植，暂用本地桩
export function deriveDurableFinalDeliveryRequirements(_input?: unknown): unknown {
  return {};
}

/** 创建运行时出站委托。 */
// TODO: 依赖模块未移植，暂用本地桩
export function createRuntimeOutboundDelegates(_input?: unknown): unknown {
  return {};
}

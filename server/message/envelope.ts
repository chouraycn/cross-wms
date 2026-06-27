/**
 * CDFKnow 四层对话架构 — 第1层：网关消息标准化层
 *
 * 基于 OpenClaw ReplyPayload 架构的统一封装。
 * 支持多渠道消息结构、流式分片、工具卡片元数据、媒体资源和交互元素。
 *
 * 参考 OpenClaw 设计：
 * - ReplyPayload: 通道无关的消息负载结构
 * - Envelope: 统一的消息信封格式
 * - PayloadPlan: 消息发送前的规划
 */

// ===================== OpenClaw ReplyPayload 类型（融合设计）=====================

/** 消息呈现样式 */
export type MessagePresentation =
  | 'bubble'        // 普通气泡
  | 'card'          // 卡片形式
  | 'list'          // 列表形式
  | 'button'        // 按钮组
  | 'inline'        // 内联文本
  | 'tool-result'   // 工具结果卡片
  | 'error'         // 错误提示
  | 'status';       // 状态通知

/** 交付策略 */
export type DeliveryPolicy =
  | 'default'       // 默认：普通发送
  | 'pin'           // 置顶消息
  | 'ephemeral'     // 临时消息（不持久化）
  | 'silent'        // 静默通知
  | 'urgent';       // 紧急通知

/** 交互元素 */
export interface InteractiveElement {
  type: 'button' | 'select' | 'input';
  id: string;
  label: string;
  value?: string;
  action?: string;
}

/** BTW (By The Way) 旁支问题 */
export interface BTWQuestion {
  question: string;
}

/** 消息元数据 */
export interface MessageMeta {
  model: string;
  tokenIn: number;
  tokenOut: number;
  elapsedMs: number;
  sessionId: string;
  agentId?: string;
  autoReason?: string;
  cacheHit?: boolean;
  fallbackModel?: string;
  fallbackReason?: string;
  toolTrace: ToolTraceEntry[];
  // OpenClaw 扩展字段
  presentation?: MessagePresentation;
  delivery?: DeliveryPolicy;
}

// ===================== 核心类型定义 =====================

export type MessageRole = 'user' | 'assistant' | 'system' | 'skill' | 'mcp';

/** 工具调用追踪记录 */
export interface ToolTraceEntry {
  type: 'skill' | 'mcp';
  name: string;
  success: boolean;
  duration: number;
  input?: Record<string, unknown>;
  result?: string;
  error?: string;
}

/** 工具调用块 */
export interface ToolBlock {
  id: string;
  type: 'skill' | 'mcp';
  name: string;
  input: Record<string, unknown>;
  result?: string;
  error?: string;
  status: 'pending' | 'running' | 'done' | 'error';
  startedAt?: number;
  completedAt?: number;
}

/** 统一消息信封（所有渠道通用）— 融合 OpenClaw ReplyPayload 架构 */
export interface MessageEnvelope {
  // 基础字段（向后兼容）
  id: string;
  role: MessageRole;
  content: string;
  meta?: MessageMeta;
  toolBlocks?: ToolBlock[];
  isStreaming: boolean;
  thinking?: string;
  thinkingDone?: boolean;
  timestamp: number;

  // OpenClaw ReplyPayload 扩展字段
  /** 媒体资源 */
  mediaUrl?: string;
  mediaUrls?: string[];
  /** 信任的本地媒体（内部信令） */
  trustedLocalMedia?: boolean;
  /** 敏感媒体（不持久化引用） */
  sensitiveMedia?: boolean;

  /** 消息呈现样式 */
  presentation?: MessagePresentation;
  /** 交付策略 */
  delivery?: DeliveryPolicy;

  /** 交互元素 */
  interactive?: {
    type: 'button' | 'select' | 'input';
    elements: InteractiveElement[];
  };
  /** 旁支问题（BTW） */
  btw?: BTWQuestion;
  /** 回复目标消息 ID */
  replyToId?: string;
  /** 回复标签 */
  replyToTag?: boolean;

  /** 语音消息标记 */
  audioAsVoice?: boolean;
  /** 口语化文本（TTS 用） */
  spokenText?: string;

  /** 推理/思考块标记 */
  isReasoning?: boolean;
  /** 推理快照（完整替换，非增量） */
  isReasoningSnapshot?: boolean;
  /** 压缩通知标记 */
  isCompactionNotice?: boolean;
  /** 模型降级通知标记 */
  isFallbackNotice?: boolean;
  /** 状态通知标记（非回答内容） */
  isStatusNotice?: boolean;
  /** 错误消息标记 */
  isError?: boolean;

  /** 通道特定数据 */
  channelData?: Record<string, unknown>;
}

/** SSE 事件类型（精简版） */
export type SSEEventType =
  | 'message-init'
  | 'message-stream'
  | 'message-thinking'
  | 'message-tool'
  | 'message-done'
  | 'message-error'
  | 'keep-alive';

/** SSE 事件信封 */
export interface SSEEvent {
  type: SSEEventType;
  payload: MessageEnvelope;
}

// ===================== 工具函数 =====================

let _counter = 0;

/** 生成消息 ID */
export function genMessageId(): string {
  _counter += 1;
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  const seq = _counter.toString(36);
  return `msg_${ts}_${rand}_${seq}`;
}

/** 创建用户消息信封 */
export function createUserEnvelope(
  content: string,
  sessionId: string,
  options?: Partial<Pick<MessageEnvelope, 'mediaUrl' | 'replyToId' | 'channelData'>>,
): MessageEnvelope {
  return {
    id: genMessageId(),
    role: 'user',
    content,
    isStreaming: false,
    timestamp: Date.now(),
    meta: {
      model: '',
      tokenIn: 0,
      tokenOut: 0,
      elapsedMs: 0,
      sessionId,
      toolTrace: [],
    },
    ...(options?.mediaUrl ? { mediaUrl: options.mediaUrl } : {}),
    ...(options?.replyToId ? { replyToId: options.replyToId } : {}),
    ...(options?.channelData ? { channelData: options.channelData } : {}),
  };
}

/** 创建 AI 响应信封（流式） */
export function createAssistantEnvelope(
  sessionId: string,
  model: string,
  options?: {
    agentId?: string;
    presentation?: MessagePresentation;
    delivery?: DeliveryPolicy;
  },
): MessageEnvelope {
  return {
    id: genMessageId(),
    role: 'assistant',
    content: '',
    isStreaming: true,
    timestamp: Date.now(),
    meta: {
      model,
      tokenIn: 0,
      tokenOut: 0,
      elapsedMs: 0,
      sessionId,
      toolTrace: [],
      ...(options?.agentId ? { agentId: options.agentId } : {}),
      ...(options?.presentation ? { presentation: options.presentation } : {}),
      ...(options?.delivery ? { delivery: options.delivery } : {}),
    },
  };
}

/** 创建工具调用块 */
export function createToolBlock(
  type: 'skill' | 'mcp',
  name: string,
  input: Record<string, unknown>,
): ToolBlock {
  return {
    id: `tool_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    name,
    input,
    status: 'pending',
    startedAt: Date.now(),
  };
}

// ===================== OpenClaw ReplyPayload 辅助函数 =====================

/** 从信封中提取文本内容 */
export function extractTextFromEnvelope(envelope: MessageEnvelope): string {
  return envelope.content || '';
}

/** 从信封中提取思考内容 */
export function extractThinkingFromEnvelope(envelope: MessageEnvelope): string {
  return envelope.thinking || '';
}

/** 检查信封是否为推理/思考消息 */
export function isReasoningEnvelope(envelope: MessageEnvelope): boolean {
  return envelope.isReasoning === true;
}

/** 检查信封是否为压缩通知 */
export function isCompactionNotice(envelope: MessageEnvelope): boolean {
  return envelope.isCompactionNotice === true;
}

/** 检查信封是否为降级通知 */
export function isFallbackNotice(envelope: MessageEnvelope): boolean {
  return envelope.isFallbackNotice === true;
}

/** 检查信封是否为状态通知 */
export function isStatusNotice(envelope: MessageEnvelope): boolean {
  return envelope.isStatusNotice === true;
}

/** 创建状态通知信封 */
export function createStatusNoticeEnvelope(
  sessionId: string,
  content: string,
  delivery: DeliveryPolicy = 'silent',
): MessageEnvelope {
  return {
    id: genMessageId(),
    role: 'assistant',
    content,
    isStreaming: false,
    isStatusNotice: true,
    delivery,
    timestamp: Date.now(),
    meta: {
      model: '',
      tokenIn: 0,
      tokenOut: 0,
      elapsedMs: 0,
      sessionId,
      toolTrace: [],
      presentation: 'status',
      delivery,
    },
  };
}

/** 创建压缩通知信封 */
export function createCompactionNoticeEnvelope(
  sessionId: string,
  message: string,
): MessageEnvelope {
  return {
    id: genMessageId(),
    role: 'assistant',
    content: message,
    isStreaming: false,
    isCompactionNotice: true,
    delivery: 'silent',
    timestamp: Date.now(),
    meta: {
      model: '',
      tokenIn: 0,
      tokenOut: 0,
      elapsedMs: 0,
      sessionId,
      toolTrace: [],
      presentation: 'status',
      delivery: 'silent',
    },
  };
}

/** 创建降级通知信封 */
export function createFallbackNoticeEnvelope(
  sessionId: string,
  fromModel: string,
  toModel: string,
  reason?: string,
): MessageEnvelope {
  return {
    id: genMessageId(),
    role: 'assistant',
    content: reason || `模型从 ${fromModel} 降级到 ${toModel}`,
    isStreaming: false,
    isFallbackNotice: true,
    delivery: 'silent',
    timestamp: Date.now(),
    meta: {
      model: toModel,
      tokenIn: 0,
      tokenOut: 0,
      elapsedMs: 0,
      sessionId,
      toolTrace: [],
      fallbackModel: toModel,
      fallbackReason: reason,
      presentation: 'status',
      delivery: 'silent',
    },
  };
}

/** 创建错误消息信封 */
export function createErrorEnvelope(
  sessionId: string,
  errorMessage: string,
  errorCode?: string,
): MessageEnvelope {
  return {
    id: genMessageId(),
    role: 'assistant',
    content: errorMessage,
    isStreaming: false,
    isError: true,
    timestamp: Date.now(),
    meta: {
      model: '',
      tokenIn: 0,
      tokenOut: 0,
      elapsedMs: 0,
      sessionId,
      toolTrace: [],
      presentation: 'error',
    },
    channelData: errorCode ? { errorCode } : undefined,
  };
}

/** 创建旁支问题信封 */
export function createBTWEnvelope(
  sessionId: string,
  question: string,
): MessageEnvelope {
  return {
    id: genMessageId(),
    role: 'assistant',
    content: question,
    isStreaming: false,
    btw: { question },
    timestamp: Date.now(),
    meta: {
      model: '',
      tokenIn: 0,
      tokenOut: 0,
      elapsedMs: 0,
      sessionId,
      toolTrace: [],
    },
  };
}

/** 创建工具结果信封 */
export function createToolResultEnvelope(
  sessionId: string,
  toolName: string,
  result: string,
  options?: {
    isError?: boolean;
    toolType?: 'skill' | 'mcp';
  },
): MessageEnvelope {
  return {
    id: genMessageId(),
    role: 'assistant',
    content: result,
    isStreaming: false,
    isError: options?.isError,
    timestamp: Date.now(),
    meta: {
      model: '',
      tokenIn: 0,
      tokenOut: 0,
      elapsedMs: 0,
      sessionId,
      toolTrace: [{
        type: options?.toolType || 'skill',
        name: toolName,
        success: !options?.isError,
        duration: 0,
        result,
      }],
      presentation: 'tool-result',
    },
  };
}

// ===================== 信封验证工具 =====================

/** 验证信封是否为有效消息 */
export function isValidEnvelope(envelope: unknown): envelope is MessageEnvelope {
  if (!envelope || typeof envelope !== 'object') {
    return false;
  }
  const e = envelope as Record<string, unknown>;
  return (
    typeof e.id === 'string' &&
    typeof e.role === 'string' &&
    typeof e.content === 'string' &&
    typeof e.isStreaming === 'boolean' &&
    typeof e.timestamp === 'number'
  );
}

/** 验证是否为用户消息 */
export function isUserMessage(envelope: MessageEnvelope): boolean {
  return envelope.role === 'user';
}

/** 验证是否为 AI 助手消息 */
export function isAssistantMessage(envelope: MessageEnvelope): boolean {
  return envelope.role === 'assistant';
}

/** 验证是否为流式消息 */
export function isStreamingMessage(envelope: MessageEnvelope): boolean {
  return envelope.isStreaming;
}

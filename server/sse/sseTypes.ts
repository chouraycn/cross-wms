/**
 * SSE 事件类型定义 — 统一事件类型系统
 *
 * 将原有 24 种 SSE 事件精简为 8 种核心事件：
 * 1. init — 初始化元数据
 * 2. text — 文本内容流式输出
 * 3. thinking — 深度思考内容
 * 4. tool_call — 工具调用通知
 * 5. error — 后端错误通知（确保前端能收到，避免卡在"思考中"）
 * 6. done — 流结束信号
 * 7. debug — 可选调试事件（合并原 ReAct 内部事件，通过 LOG_DEBUG=1 启用）
 *
 * 向后兼容：旧事件类型通过 sendDebugSSE 发送，前端仍能接收但不在 UI 上展示。
 */

import type { Response } from 'express';

// ===================== 核心事件类型 =====================

/** init 事件 — 初始化元数据 */
export interface SSEInitEvent {
  type: 'init';
  sessionId: string;
  assistantMessageId: string;
  model: string;
  modelName: string;
  autoReason?: string;
  autoReasonType?: string;
  /** 语义路由细节（[六] Auto Model v2.0）：规则/语义融合方法，供前端展示智能路由透明度 */
  autoSemanticMethod?: string;
  /** 语义路由置信度（0~1），越高表示越确定走语义融合 */
  autoSemanticConfidence?: number;
  preset?: { id: string; label: string } | null;
}

/** text 事件 — 文本内容流式输出 */
export interface SSETextEvent {
  type: 'text';
  content: string;
}

/** thinking 事件 — 深度思考内容 */
export interface SSEThinkingEvent {
  type: 'thinking';
  content: string;
}

/** tool_call 事件 — 工具调用通知 */
export interface SSEToolCallEvent {
  type: 'tool_call';
  toolCallId?: string;
  toolName?: string;
  tool?: string;
  toolArgs?: string;
  args?: string;
  result?: string;
  id?: string;
}

/** error 事件 — 后端错误通知（确保前端能收到，避免卡在"思考中"） */
export interface SSEErrorEvent {
  type: 'error';
  /** 错误代码（如 AUTH_FAILED, RATE_LIMITED, SERVER_ERROR 等） */
  code: string;
  /** 用户友好的错误消息 */
  message: string;
}

/** done 事件 — 流结束信号 */
export interface SSEDoneEvent {
  type: 'done';
  errorCode: string | null;
  errorMessage: string | null;
  thinkingDuration?: number;
  usage?: { promptTokens?: number; completionTokens?: number; thinkingTokens?: number; totalTokens?: number } | null;
  fallbackModel?: string;
  fallbackReason?: string;
}

/** debug 事件 — 可选调试事件（合并原 ReAct 内部事件） */
export interface SSEDebugEvent {
  type: string; // 原始事件类型（如 react_phase, complexity_assessment 等）
  [key: string]: unknown;
}

/**
 * file 事件 — 技能/工具产出文件实时回写（T1）
 *
 * 与 GeneratedFile 字段对齐，并额外携带 fileId（去重/引用主键）、
 * source（来源）、skillId（技能 id）、toolCallId 等路由信息。
 * 由 runChatSession 在工具结果返回后实时 emit，与既有 file_generateFile 写库逻辑并存。
 */
export interface SSEFileEvent {
  type: 'file';
  /** sha256(sessionId + fileName) 截断，去重/引用主键 */
  fileId: string;
  toolCallId?: string;
  /** 文件产出来源 */
  source: 'skill' | 'tool' | 'agent';
  /** 技能 id（source==='skill' 时） */
  skillId?: string;
  fileName: string;
  mimeType?: string;
  fileSize: number;
  downloadUrl: string;
  previewUrl?: string;
  description?: string;
  sessionId?: string;
  createdAt?: string;
}

// ===================== 工具稳定性事件类型 (P1-2) =====================

/** tool_retry 事件 — 工具执行重试通知 */
export interface SSEToolRetryEvent {
  type: 'tool_retry';
  toolName: string;
  attempt: number; // 当前重试次数（从 1 开始）
  maxAttempts: number;
  reason: string; // 重试原因（如 ECONNRESET, timeout, 5xx）
  sessionId?: string;
}

/** tool_timeout 事件 — 工具执行超时通知 */
export interface SSEToolTimeoutEvent {
  type: 'tool_timeout';
  toolName: string;
  timeoutMs: number;
  sessionId?: string;
}

/** tool_abort 事件 — 工具执行取消通知 */
export interface SSEToolAbortEvent {
  type: 'tool_abort';
  toolName: string;
  reason: 'user_cancel' | 'cascaded' | 'external' | 'resource_limit';
  sessionId?: string;
}

/** tool_fallback 事件 — 工具降级通知 */
export interface SSEToolFallbackEvent {
  type: 'tool_fallback';
  primaryTool: string;
  fallbackTool: string;
  reason: string; // 降级原因
  sessionId?: string;
}

/** tool_stats 事件 — 工具统计更新通知（定时推送或阈值触发） */
export interface SSEToolStatsEvent {
  type: 'tool_stats';
  toolName: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  healthScore: number;
  consecutiveFailures: number;
}

// ===================== 联合类型 =====================

/** 8 种核心 SSE 事件联合类型 */
export type SSEEvent =
  | SSEInitEvent
  | SSETextEvent
  | SSEThinkingEvent
  | SSEToolCallEvent
  | SSEErrorEvent
  | SSEDoneEvent
  | SSEDebugEvent
  | SSEFileEvent;

// ===================== 核心事件类型集合 =====================

/** 8 种核心事件类型字面量 */
export const CORE_EVENT_TYPES = [
  'init',
  'text',
  'thinking',
  'tool_call',
  'error',
  'done',
  'debug',
  'file',
] as const;

// ===================== 工具稳定性事件类型集合 (P1-2) =====================

/** 工具稳定性事件类型字面量 */
export const TOOL_STABILITY_EVENT_TYPES = [
  'tool_retry',
  'tool_timeout',
  'tool_abort',
  'tool_fallback',
  'tool_stats',
] as const;

/** 工具稳定性事件类型 */
export type ToolStabilityEventType = (typeof TOOL_STABILITY_EVENT_TYPES)[number];

/** 工具稳定性事件联合类型 */
export type ToolStabilitySSEEvent =
  | SSEToolRetryEvent
  | SSEToolTimeoutEvent
  | SSEToolAbortEvent
  | SSEToolFallbackEvent
  | SSEToolStatsEvent;

/**
 * 判断事件类型是否为工具稳定性事件 (P1-2)
 */
export function isToolStabilityEventType(type: string): boolean {
  return (TOOL_STABILITY_EVENT_TYPES as readonly string[]).includes(type);
}

/**
 * 发送工具稳定性 SSE 事件 (P1-2)
 * 通过 sendSSE 写入，前端可订阅这些事件类型以展示重试/超时/降级等反馈
 */
export function sendToolStabilitySSE(res: Response, event: ToolStabilitySSEEvent): void {
  sendSSE(res, event as unknown as Record<string, unknown>);
}

/** 核心事件类型 */
export type CoreEventType = (typeof CORE_EVENT_TYPES)[number];

/**
 * 判断事件类型是否属于核心 8 种。
 * 非核心事件类型需要通过 sendDebugSSE 发送。
 */
export function isCoreEventType(type: string): boolean {
  return (CORE_EVENT_TYPES as readonly string[]).includes(type);
}

// ===================== 辅助函数 =====================

/**
 * 安全写入 SSE 数据 — 内置 writableEnded 检查 + try-catch
 *
 * 所有 SSE 写入必须使用此函数，禁止裸 res.write()。
 */
export function sendSSE(res: Response, event: Record<string, unknown>): void {
  if (!res.writableEnded) {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {
      // 连接已断开，忽略写入异常
    }
  }
}

/**
 * 发送调试事件 — 检查 LOG_DEBUG 环境变量
 *
 * 非核心事件类型（如 react_phase, complexity_assessment, keep_alive 等）
 * 统一通过此函数发送。仅当 LOG_DEBUG=1 时实际写入。
 *
 * 向后兼容：即使 LOG_DEBUG 未开启，也不影响调用方逻辑（静默跳过）。
 */
const SENSITIVE_KEY_RE = /(token|secret|password|passwd|api[_-]?key|authorization|sk-|cookie|sessionid|access[_-]?key)/i;
const PATH_RE = /(\/Users\/[^\s"']*|\/home\/[^\s"']*|[A-Za-z]:\\[^\s"']*|~\/[^\s"']*)/g;
const LONG_DEBUG_FIELDS = new Set(['toolArgs', 'args', 'result', 'content', 'message', 'tool_call', 'raw']);

/**
 * 调试事件脱敏 — 防止密钥/Token/内部路径经 sendDebugSSE 泄露到前端 SSE。
 * 仅当字段名命中敏感词时整字段遮蔽；绝对路径打码；超长字段截断。
 */
function sanitizeForDebug(event: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(event)) {
    if (typeof v === 'string') {
      if (SENSITIVE_KEY_RE.test(k)) {
        out[k] = '[REDACTED]';
        continue;
      }
      let s = v.replace(PATH_RE, '<path>');
      if (s.length > 200) s = s.slice(0, 200) + '…[truncated]';
      out[k] = s;
    } else if (v && typeof v === 'object') {
      if (LONG_DEBUG_FIELDS.has(k)) {
        const json = JSON.stringify(v);
        out[k] = json.length > 200 ? json.slice(0, 200) + '…[truncated]' : json;
      } else {
        out[k] = v;
      }
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function sendDebugSSE(res: Response, event: Record<string, unknown>, sessionId?: string): void {
  // LOG_DEBUG=1 时发送调试事件，否则静默跳过
  if (process.env.LOG_DEBUG !== '1') return;
  if (!res.writableEnded) {
    try {
      const payload = sessionId
        ? { ...sanitizeForDebug(event), sessionId, _channel: 'debug' }
        : { ...sanitizeForDebug(event), _channel: 'debug' };
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch {
      // 连接已断开，忽略写入异常
    }
  }
}

/**
 * 发送 done 事件并结束响应流
 *
 * 统一封装 done 事件发送 + res.end()，包含 200ms 延迟确保前端接收。
 */
export async function sendDoneAndEnd(
  res: Response,
  options: {
    errorCode?: string | null;
    errorMessage?: string | null;
    thinkingDuration?: number;
    usage?: unknown;
    fallbackModel?: string;
    fallbackReason?: string;
  } = {},
): Promise<void> {
  sendSSE(res, {
    type: 'done',
    errorCode: options.errorCode ?? null,
    errorMessage: options.errorMessage ?? null,
    thinkingDuration: options.thinkingDuration ?? 0,
    usage: options.usage ?? null,
    ...(options.fallbackModel ? { fallbackModel: options.fallbackModel } : {}),
    ...(options.fallbackReason ? { fallbackReason: options.fallbackReason } : {}),
  });
  await new Promise<void>((resolve) => setTimeout(resolve, 200));
  try {
    res.end();
  } catch {
    // 响应流可能已关闭，忽略
  }
}

// ===================== 细粒度事件类型（v2.0 扩展）=====================

/** text_start 事件 — 文本内容开始 */
export interface SSETextStartEvent {
  type: 'text_start';
  /** 多内容块索引（支持并行流） */
  contentIndex: number;
  /** 实际使用的模型 */
  model?: string;
  /** 模型响应 ID */
  responseId?: string;
}

/** text_delta 事件 — 文本内容增量 */
export interface SSETextDeltaEvent {
  type: 'text_delta';
  /** 多内容块索引 */
  contentIndex: number;
  /** 增量文本（可省略以节省带宽） */
  partial?: string;
  /** 停止原因 */
  stopReason?: string;
}

/** text_end 事件 — 文本内容结束 */
export interface SSETextEndEvent {
  type: 'text_end';
  /** 多内容块索引 */
  contentIndex: number;
  /** 停止原因 */
  stopReason?: 'stop' | 'length' | 'toolUse' | 'error' | 'aborted';
}

/** thinking_start 事件 — 思考内容开始 */
export interface SSEThinkingStartEvent {
  type: 'thinking_start';
  /** 多内容块索引 */
  contentIndex: number;
  /** 思考类型 */
  thinkingType?: 'deep' | 'local';
  /** 加密签名（可回传 API） */
  thinkingSignature?: string;
  /** 安全脱敏标记 */
  redacted?: boolean;
}

/** thinking_delta 事件 — 思考内容增量 */
export interface SSEThinkingDeltaEvent {
  type: 'thinking_delta';
  /** 多内容块索引 */
  contentIndex: number;
  /** 增量思考内容 */
  partial?: string;
}

/** thinking_end 事件 — 思考内容结束 */
export interface SSEThinkingEndEvent {
  type: 'thinking_end';
  /** 多内容块索引 */
  contentIndex: number;
  /** 思考耗时（毫秒） */
  thinkingDuration?: number;
  /** 加密签名（可回传 API） */
  thinkingSignature?: string;
  /** 安全脱敏标记 */
  redacted?: boolean;
}

/** tool_call_start 事件 — 工具调用开始 */
export interface SSEToolCallStartEvent {
  type: 'tool_call_start';
  /** 工具调用 ID */
  toolCallId: string;
  /** 工具名称 */
  toolName: string;
  /** 多内容块索引 */
  contentIndex?: number;
}

/** tool_call_delta 事件 — 工具调用参数增量 */
export interface SSEToolCallDeltaEvent {
  type: 'tool_call_delta';
  /** 工具调用 ID */
  toolCallId: string;
  /** 参数 JSON 增量 */
  argsDelta: string;
}

/** tool_call_end 事件 — 工具调用结束 */
export interface SSEToolCallEndEvent {
  type: 'tool_call_end';
  /** 工具调用 ID */
  toolCallId: string;
  /** 完整参数 JSON */
  args: string;
}

/** image_start 事件 — 图片内容开始（流式传输图片） */
export interface SSEImageStartEvent {
  type: 'image_start';
  /** 多内容块索引 */
  contentIndex: number;
  /** 图片 MIME 类型 */
  mimeType?: string;
  /** 图片替代文本 */
  alt?: string;
}

/** image_delta 事件 — 图片内容增量（base64 分块） */
export interface SSEImageDeltaEvent {
  type: 'image_delta';
  /** 多内容块索引 */
  contentIndex: number;
  /** base64 增量分块 */
  partial?: string;
}

/** image_end 事件 — 图片内容结束 */
export interface SSEImageEndEvent {
  type: 'image_end';
  /** 多内容块索引 */
  contentIndex: number;
  /** 完整图片 URL（如果可用） */
  url?: string;
  /** 停止原因 */
  stopReason?: 'stop' | 'length' | 'error' | 'aborted';
}

/** audio_start 事件 — 音频内容开始（流式传输音频） */
export interface SSEAudioStartEvent {
  type: 'audio_start';
  /** 多内容块索引 */
  contentIndex: number;
  /** 音频 MIME 类型 */
  mimeType?: string;
  /** 是否为语音消息 */
  isVoiceNote?: boolean;
}

/** audio_delta 事件 — 音频内容增量（base64 分块） */
export interface SSEAudioDeltaEvent {
  type: 'audio_delta';
  /** 多内容块索引 */
  contentIndex: number;
  /** base64 增量分块 */
  partial?: string;
}

/** audio_end 事件 — 音频内容结束 */
export interface SSEAudioEndEvent {
  type: 'audio_end';
  /** 多内容块索引 */
  contentIndex: number;
  /** 完整音频 URL（如果可用） */
  url?: string;
  /** 语音转文字内容 */
  transcript?: string;
  /** 停止原因 */
  stopReason?: 'stop' | 'length' | 'error' | 'aborted';
}

// ===================== 细粒度事件联合类型 =====================

/** 15 种细粒度 SSE 事件联合类型 */
export type FineGrainedSSEEvent =
  | SSETextStartEvent
  | SSETextDeltaEvent
  | SSETextEndEvent
  | SSEThinkingStartEvent
  | SSEThinkingDeltaEvent
  | SSEThinkingEndEvent
  | SSEToolCallStartEvent
  | SSEToolCallDeltaEvent
  | SSEToolCallEndEvent
  | SSEImageStartEvent
  | SSEImageDeltaEvent
  | SSEImageEndEvent
  | SSEAudioStartEvent
  | SSEAudioDeltaEvent
  | SSEAudioEndEvent;

/** 全部 SSE 事件联合类型（核心 + 细粒度） */
export type AllSSEEvent = SSEEvent | FineGrainedSSEEvent;

// ===================== 细粒度事件类型集合 =====================

/** 15 种细粒度事件类型字面量 */
export const FINE_GRAINED_EVENT_TYPES = [
  'text_start',
  'text_delta',
  'text_end',
  'thinking_start',
  'thinking_delta',
  'thinking_end',
  'tool_call_start',
  'tool_call_delta',
  'tool_call_end',
  'image_start',
  'image_delta',
  'image_end',
  'audio_start',
  'audio_delta',
  'audio_end',
] as const;

/** 细粒度事件类型 */
export type FineGrainedEventType = (typeof FINE_GRAINED_EVENT_TYPES)[number];

/** 全部事件类型字面量 */
export const ALL_EVENT_TYPES = [...CORE_EVENT_TYPES, ...FINE_GRAINED_EVENT_TYPES] as const;

/** 全部事件类型 */
export type AllEventType = (typeof ALL_EVENT_TYPES)[number];

/**
 * 判断事件类型是否属于细粒度类型
 */
export function isFineGrainedEventType(type: string): boolean {
  return (FINE_GRAINED_EVENT_TYPES as readonly string[]).includes(type);
}

/**
 * 判断事件类型是否为核心或细粒度类型
 */
export function isKnownEventType(type: string): boolean {
  return isCoreEventType(type) || isFineGrainedEventType(type);
}

// ===================== 细粒度事件辅助函数 =====================

/**
 * 发送细粒度 SSE 事件
 *
 * 与 sendSSE 相同的写入逻辑，但带类型提示。
 */
export function sendFineGrainedSSE(res: Response, event: FineGrainedSSEEvent): void {
  sendSSE(res, event as unknown as Record<string, unknown>);
}

/**
 * 从细粒度事件中提取 contentIndex
 */
export function getContentIndex(event: AllSSEEvent): number {
  if ('contentIndex' in event && typeof event.contentIndex === 'number') {
    return event.contentIndex;
  }
  return 0;
}

/**
 * 判断事件是否为文本相关事件（text/text_start/text_delta/text_end）
 */
export function isTextRelatedEvent(type: string): boolean {
  return type === 'text' || type === 'text_start' || type === 'text_delta' || type === 'text_end';
}

/**
 * 判断事件是否为思考相关事件（thinking/thinking_start/thinking_delta/thinking_end）
 */
export function isThinkingRelatedEvent(type: string): boolean {
  return type === 'thinking' || type === 'thinking_start' || type === 'thinking_delta' || type === 'thinking_end';
}

/**
 * 判断事件是否为工具调用相关事件（tool_call/tool_call_start/tool_call_delta/tool_call_end）
 */
export function isToolCallRelatedEvent(type: string): boolean {
  return type === 'tool_call' || type === 'tool_call_start' || type === 'tool_call_delta' || type === 'tool_call_end';
}

/**
 * 判断事件是否为图片相关事件（image_start/image_delta/image_end）
 */
export function isImageRelatedEvent(type: string): boolean {
  return type === 'image_start' || type === 'image_delta' || type === 'image_end';
}

/**
 * 判断事件是否为音频相关事件（audio_start/audio_delta/audio_end）
 */
export function isAudioRelatedEvent(type: string): boolean {
  return type === 'audio_start' || type === 'audio_delta' || type === 'audio_end';
}

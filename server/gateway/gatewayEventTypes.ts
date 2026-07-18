/**
 * Gateway Event Types
 * Gateway 事件类型常量与载荷定义
 *
 * 集中维护所有通过 GatewayEventBus 派发的事件类型字符串，
 * 避免业务模块直接硬编码字符串字面量。
 */

// ==================== 事件类型常量 ====================

export const GATEWAY_EVENT_TYPES = {
  // Chat 域事件
  CHAT_MESSAGE: 'chat.message',
  CHAT_RESPONSE: 'chat.response',
  CHAT_ERROR: 'chat.error',

  // Session 域事件
  SESSION_CREATE: 'session.create',
  SESSION_UPDATE: 'session.update',
  SESSION_DELETE: 'session.delete',

  // Tool 域事件
  TOOL_CALL_START: 'tool.call.start',
  TOOL_CALL_END: 'tool.call.end',

  // Cron 域事件
  CRON_TICK: 'cron.tick',
  CRON_DONE: 'cron.done',

  // Gateway 自身事件
  GATEWAY_AUTH: 'gateway.auth',
  GATEWAY_PROBE: 'gateway.probe',

  // 系统事件
  SYSTEM_SHUTDOWN: 'system.shutdown',
  SYSTEM_READY: 'system.ready',
} as const;

export type GatewayEventType = typeof GATEWAY_EVENT_TYPES[keyof typeof GATEWAY_EVENT_TYPES];

// ==================== 事件载荷类型 ====================

export interface ChatMessagePayload {
  sessionKey: string;
  message: string;
  attachments?: Array<{ type: string; content: string; mimeType?: string }>;
  model?: string;
  agent?: string;
}

export interface ChatResponsePayload {
  sessionKey: string;
  runId?: string;
  content: string;
  done: boolean;
  model?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ChatErrorPayload {
  sessionKey: string;
  runId?: string;
  error: string;
  code?: string;
  retriable?: boolean;
}

export interface SessionCreatePayload {
  sessionKey: string;
  label?: string;
  meta?: Record<string, unknown>;
}

export interface SessionUpdatePayload {
  sessionKey: string;
  changes: Record<string, unknown>;
  version?: number;
}

export interface SessionDeletePayload {
  sessionKey: string;
  reason?: string;
}

export interface ToolCallStartPayload {
  toolName: string;
  callId: string;
  args?: unknown;
  sessionKey?: string;
}

export interface ToolCallEndPayload {
  toolName: string;
  callId: string;
  ok: boolean;
  result?: unknown;
  error?: string;
  durationMs?: number;
}

export interface CronTickPayload {
  jobId: string;
  schedule: string;
  fireAt: number;
}

export interface CronDonePayload {
  jobId: string;
  ok: boolean;
  durationMs: number;
  error?: string;
}

export interface GatewayAuthPayload {
  clientId?: string;
  apiKey?: string;
  success: boolean;
  ip?: string;
  reason?: string;
}

export interface GatewayProbePayload {
  endpoint: string;
  method: string;
  statusCode: number;
  durationMs: number;
  clientId?: string;
}

export interface SystemShutdownPayload {
  reason: string;
  code?: number;
  graceful?: boolean;
}

export interface SystemReadyPayload {
  version: string;
  startedAt: number;
  uptimeMs?: number;
}

export interface GatewayEventPayloadMap {
  [GATEWAY_EVENT_TYPES.CHAT_MESSAGE]: ChatMessagePayload;
  [GATEWAY_EVENT_TYPES.CHAT_RESPONSE]: ChatResponsePayload;
  [GATEWAY_EVENT_TYPES.CHAT_ERROR]: ChatErrorPayload;
  [GATEWAY_EVENT_TYPES.SESSION_CREATE]: SessionCreatePayload;
  [GATEWAY_EVENT_TYPES.SESSION_UPDATE]: SessionUpdatePayload;
  [GATEWAY_EVENT_TYPES.SESSION_DELETE]: SessionDeletePayload;
  [GATEWAY_EVENT_TYPES.TOOL_CALL_START]: ToolCallStartPayload;
  [GATEWAY_EVENT_TYPES.TOOL_CALL_END]: ToolCallEndPayload;
  [GATEWAY_EVENT_TYPES.CRON_TICK]: CronTickPayload;
  [GATEWAY_EVENT_TYPES.CRON_DONE]: CronDonePayload;
  [GATEWAY_EVENT_TYPES.GATEWAY_AUTH]: GatewayAuthPayload;
  [GATEWAY_EVENT_TYPES.GATEWAY_PROBE]: GatewayProbePayload;
  [GATEWAY_EVENT_TYPES.SYSTEM_SHUTDOWN]: SystemShutdownPayload;
  [GATEWAY_EVENT_TYPES.SYSTEM_READY]: SystemReadyPayload;
}

// ==================== 事件来源常量 ====================

export const GATEWAY_EVENT_SOURCES = {
  GATEWAY: 'gateway',
  CHAT: 'chat',
  SESSION: 'session',
  TOOL: 'tool',
  CRON: 'cron',
  AUTH: 'auth',
  PROBE: 'probe',
  SYSTEM: 'system',
} as const;

export type GatewayEventSource = typeof GATEWAY_EVENT_SOURCES[keyof typeof GATEWAY_EVENT_SOURCES];

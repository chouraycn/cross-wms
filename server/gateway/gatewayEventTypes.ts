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

  // Approval 域事件（执行审批与插件审批）
  EXEC_APPROVAL_REQUESTED: 'exec.approval.requested',
  EXEC_APPROVAL_RESOLVED: 'exec.approval.resolved',
  PLUGIN_APPROVAL_REQUESTED: 'plugin.approval.requested',
  PLUGIN_APPROVAL_RESOLVED: 'plugin.approval.resolved',

  // Cron 域事件
  CRON_TICK: 'cron.tick',
  CRON_DONE: 'cron.done',

  // Gateway 自身事件
  GATEWAY_AUTH: 'gateway.auth',
  GATEWAY_PROBE: 'gateway.probe',

  // Talk 域事件（语音对话）
  TALK_MODE: 'talk.mode',
  TALK_EVENT: 'talk.event',

  // VoiceWake 域事件（语音唤醒）
  VOICEWAKE_CHANGED: 'voicewake.changed',
  VOICEWAKE_ROUTING_CHANGED: 'voicewake.routing.changed',

  // Presence 域事件（在线状态）
  PRESENCE: 'presence',

  // 心跳事件
  HEARTBEAT: 'heartbeat',

  // 更新通知事件
  UPDATE_AVAILABLE: 'update.available',

  // 系统事件
  SYSTEM_SHUTDOWN: 'system.shutdown',
  SYSTEM_READY: 'system.ready',

  // 统一 Agent / Session 事件（与 openclaw GATEWAY_EVENTS 对齐）
  AGENT: 'agent',
  SESSION_MESSAGE: 'session.message',
  SESSION_OPERATION: 'session.operation',
  SESSION_TOOL: 'session.tool',
  SESSIONS_CHANGED: 'sessions.changed',

  // 时钟与健康事件
  TICK: 'tick',
  HEALTH: 'health',

  // 关闭事件（与 system.shutdown 并存，openclaw 客户端使用裸名 'shutdown'）
  SHUTDOWN: 'shutdown',

  // 节点 / 设备配对事件
  NODE_PAIR_REQUESTED: 'node.pair.requested',
  NODE_PAIR_RESOLVED: 'node.pair.resolved',
  NODE_INVOKE_REQUEST: 'node.invoke.request',
  DEVICE_PAIR_REQUESTED: 'device.pair.requested',
  DEVICE_PAIR_RESOLVED: 'device.pair.resolved',
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

// ==================== Approval 域事件载荷 ====================

/** 审批请求被创建时广播的载荷（执行审批与插件审批共用） */
export interface ApprovalRequestedPayload {
  approvalId: string;
  /** 审批类型：exec 或 plugin */
  kind: 'exec' | 'plugin';
  /** 请求标题（执行审批为命令摘要，插件审批为插件请求标题） */
  title?: string;
  /** 请求描述 */
  description?: string;
  /** 严重程度（仅插件审批使用） */
  severity?: 'info' | 'warning' | 'critical';
  /** 关联会话 key（若适用） */
  sessionKey?: string;
  /** 关联 agentId（若适用） */
  agentId?: string;
  /** 关联工具名（若适用） */
  toolName?: string;
  /** 关联工具调用 ID（若适用） */
  toolCallId?: string;
  /** 请求创建时间戳（ms） */
  requestedAt: number;
}

/** 审批被解决（批准或拒绝）时广播的载荷（执行审批与插件审批共用） */
export interface ApprovalResolvedPayload {
  approvalId: string;
  /** 审批类型：exec 或 plugin */
  kind: 'exec' | 'plugin';
  /** 解决决定：approve 或 deny */
  decision: 'approve' | 'deny';
  /** 解决者标识 */
  resolvedBy?: string;
  /** 解决时间戳（ms） */
  resolvedAt: number;
  /** 关联会话 key（若适用） */
  sessionKey?: string;
  /** 解决原因（拒绝时可选） */
  reason?: string;
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

// ==================== Talk 域事件载荷 ====================

/** 语音模式变更事件载荷 */
export interface TalkModePayload {
  /** 模式是否启用 */
  enabled: boolean;
  /** 当前模式相位（如 'listening' / 'speaking' / 'idle'） */
  phase?: string | null;
  /** 变更时间戳（ms） */
  ts: number;
}

/** 语音会话事件载荷（通用会话级事件透传） */
export interface TalkEventPayload {
  /** 事件类型字符串（如 'turn.start' / 'audio.append' / 'session.close'） */
  type: string;
  /** 关联会话 ID */
  sessionId?: string;
  /** 事件详情 */
  detail?: Record<string, unknown>;
  /** 事件时间戳（ms） */
  ts: number;
}

// ==================== VoiceWake 域事件载荷 ====================

/** 语音唤醒变更事件载荷 */
export interface VoiceWakeChangedPayload {
  /** 唤醒是否启用 */
  enabled: boolean;
  /** 唤醒词 */
  activationName?: string;
  /** 变更时间戳（ms） */
  ts: number;
}

/** 语音唤醒路由变更事件载荷 */
export interface VoiceWakeRoutingChangedPayload {
  /** 路由目标（如 'agent-consult' / 'direct-tools'） */
  routing: string;
  /** 关联会话 ID */
  sessionId?: string;
  /** 变更时间戳（ms） */
  ts: number;
}

// ==================== Presence 域事件载荷 ====================

/** 在线状态变更事件载荷 */
export interface PresencePayload {
  /** 客户端标识 */
  clientId: string;
  /** 在线状态：online / offline / away */
  status: 'online' | 'offline' | 'away';
  /** 关联用户 ID */
  userId?: string;
  /** 变更时间戳（ms） */
  ts: number;
}

// ==================== 心跳事件载荷 ====================

/** 心跳事件载荷 */
export interface HeartbeatPayload {
  /** 客户端标识 */
  clientId?: string;
  /** 服务端时间戳（ms） */
  ts: number;
  /** 序列号 */
  seq?: number;
}

// ==================== 更新通知事件载荷 ====================

/** 更新可用通知事件载荷 */
export interface UpdateAvailablePayload {
  /** 新版本号 */
  version: string;
  /** 当前版本号 */
  currentVersion?: string;
  /** 更新说明 */
  releaseNotes?: string;
  /** 下载地址 */
  downloadUrl?: string;
  /** 是否强制更新 */
  mandatory?: boolean;
  /** 通知时间戳（ms） */
  ts: number;
}

// ==================== 统一 Agent / Session 事件载荷 ====================

/** Agent 域统一事件载荷（与 openclaw 的 'agent' 事件对齐） */
export interface AgentEventPayload {
  /** Agent 事件子类型（如 'agent.started' / 'agent.ended' / 'agent.message' / 'agent.error'） */
  type: string;
  /** 关联会话 key */
  sessionKey?: string;
  /** Agent 标识 */
  agentId?: string;
  /** 运行 ID */
  runId?: string;
  /** 事件详情 */
  detail?: Record<string, unknown>;
  /** 事件时间戳（ms） */
  ts: number;
}

/** 会话消息事件载荷（session.message） */
export interface SessionMessagePayload {
  sessionKey: string;
  /** 消息角色 */
  role: string;
  /** 消息内容 */
  content?: string;
  /** 关联模型 */
  model?: string;
  /** 工具调用（assistant 消息） */
  toolCalls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
  /** 事件时间戳（ms） */
  ts: number;
}

/** 会话操作事件载荷（session.operation） */
export interface SessionOperationPayload {
  sessionKey: string;
  /** 操作类型（如 'create' / 'update' / 'delete' / 'reset' / 'compact' / 'patch' / 'abort'） */
  operation: string;
  /** 操作详情 */
  detail?: Record<string, unknown>;
  /** 触发者 */
  actor?: string;
  /** 事件时间戳（ms） */
  ts: number;
}

/** 会话工具事件载荷（session.tool） */
export interface SessionToolPayload {
  sessionKey: string;
  /** 工具事件阶段（'start' / 'end'） */
  phase: 'start' | 'end';
  /** 工具名称 */
  toolName: string;
  /** 工具调用 ID */
  callId?: string;
  /** 是否成功（end 阶段适用） */
  ok?: boolean;
  /** 错误信息（end 阶段适用） */
  error?: string;
  /** 持续时长 ms（end 阶段适用） */
  durationMs?: number;
  /** 事件时间戳（ms） */
  ts: number;
}

/** 会话变更事件载荷（sessions.changed，统一版，触发客户端刷新会话列表） */
export interface SessionsChangedPayload {
  /** 变更类型（'create' / 'update' / 'delete' / 'reset' / 'compact' / 'bulk'） */
  kind: string;
  /** 受影响的会话 key 列表 */
  sessionKeys?: string[];
  /** 事件时间戳（ms） */
  ts: number;
}

// ==================== 时钟与健康事件载荷 ====================

/** 系统时钟事件载荷（tick） */
export interface TickPayload {
  /** 服务端时间戳（ms） */
  ts: number;
  /** 序列号（用于客户端检测丢包） */
  seq?: number;
  /** 系统启动至今 ms */
  uptimeMs?: number;
}

/** 健康事件载荷（health） */
export interface HealthPayload {
  /** 健康状态 */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** 服务端时间戳（ms） */
  ts: number;
  /** 系统启动至今 ms */
  uptimeMs?: number;
  /** 简要指标 */
  metrics?: Record<string, unknown>;
}

// ==================== 节点 / 设备配对事件载荷 ====================

/** 节点配对请求事件载荷 */
export interface NodePairRequestedPayload {
  requestId: string;
  nodeId: string;
  displayName?: string;
  platform?: string;
  deviceFamily?: string;
  remoteIp?: string;
  /** 请求时间戳（ms） */
  requestedAt: number;
}

/** 节点配对完成事件载荷 */
export interface NodePairResolvedPayload {
  requestId: string;
  nodeId: string;
  /** 解决决定：approve / reject */
  decision: 'approve' | 'reject';
  /** 解决时间戳（ms） */
  resolvedAt: number;
}

/** 节点调用请求事件载荷 */
export interface NodeInvokeRequestPayload {
  /** 调用 ID */
  invokeId: string;
  /** 目标节点 ID */
  nodeId: string;
  /** 调用类型 / 工具名 */
  kind: string;
  /** 调用参数 */
  args?: unknown;
  /** 请求时间戳（ms） */
  requestedAt: number;
}

/** 设备配对请求事件载荷 */
export interface DevicePairRequestedPayload {
  deviceId: string;
  name?: string;
  role?: string;
  /** 请求时间戳（ms） */
  requestedAt: number;
}

/** 设备配对完成事件载荷 */
export interface DevicePairResolvedPayload {
  deviceId: string;
  /** 解决决定：approve / reject */
  decision: 'approve' | 'reject';
  /** 解决时间戳（ms） */
  resolvedAt: number;
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
  [GATEWAY_EVENT_TYPES.EXEC_APPROVAL_REQUESTED]: ApprovalRequestedPayload;
  [GATEWAY_EVENT_TYPES.EXEC_APPROVAL_RESOLVED]: ApprovalResolvedPayload;
  [GATEWAY_EVENT_TYPES.PLUGIN_APPROVAL_REQUESTED]: ApprovalRequestedPayload;
  [GATEWAY_EVENT_TYPES.PLUGIN_APPROVAL_RESOLVED]: ApprovalResolvedPayload;
  [GATEWAY_EVENT_TYPES.CRON_TICK]: CronTickPayload;
  [GATEWAY_EVENT_TYPES.CRON_DONE]: CronDonePayload;
  [GATEWAY_EVENT_TYPES.GATEWAY_AUTH]: GatewayAuthPayload;
  [GATEWAY_EVENT_TYPES.GATEWAY_PROBE]: GatewayProbePayload;
  [GATEWAY_EVENT_TYPES.TALK_MODE]: TalkModePayload;
  [GATEWAY_EVENT_TYPES.TALK_EVENT]: TalkEventPayload;
  [GATEWAY_EVENT_TYPES.VOICEWAKE_CHANGED]: VoiceWakeChangedPayload;
  [GATEWAY_EVENT_TYPES.VOICEWAKE_ROUTING_CHANGED]: VoiceWakeRoutingChangedPayload;
  [GATEWAY_EVENT_TYPES.PRESENCE]: PresencePayload;
  [GATEWAY_EVENT_TYPES.HEARTBEAT]: HeartbeatPayload;
  [GATEWAY_EVENT_TYPES.UPDATE_AVAILABLE]: UpdateAvailablePayload;
  [GATEWAY_EVENT_TYPES.SYSTEM_SHUTDOWN]: SystemShutdownPayload;
  [GATEWAY_EVENT_TYPES.SYSTEM_READY]: SystemReadyPayload;
  [GATEWAY_EVENT_TYPES.AGENT]: AgentEventPayload;
  [GATEWAY_EVENT_TYPES.SESSION_MESSAGE]: SessionMessagePayload;
  [GATEWAY_EVENT_TYPES.SESSION_OPERATION]: SessionOperationPayload;
  [GATEWAY_EVENT_TYPES.SESSION_TOOL]: SessionToolPayload;
  [GATEWAY_EVENT_TYPES.SESSIONS_CHANGED]: SessionsChangedPayload;
  [GATEWAY_EVENT_TYPES.TICK]: TickPayload;
  [GATEWAY_EVENT_TYPES.HEALTH]: HealthPayload;
  [GATEWAY_EVENT_TYPES.SHUTDOWN]: SystemShutdownPayload;
  [GATEWAY_EVENT_TYPES.NODE_PAIR_REQUESTED]: NodePairRequestedPayload;
  [GATEWAY_EVENT_TYPES.NODE_PAIR_RESOLVED]: NodePairResolvedPayload;
  [GATEWAY_EVENT_TYPES.NODE_INVOKE_REQUEST]: NodeInvokeRequestPayload;
  [GATEWAY_EVENT_TYPES.DEVICE_PAIR_REQUESTED]: DevicePairRequestedPayload;
  [GATEWAY_EVENT_TYPES.DEVICE_PAIR_RESOLVED]: DevicePairResolvedPayload;
}

// ==================== 事件来源常量 ====================

export const GATEWAY_EVENT_SOURCES = {
  GATEWAY: 'gateway',
  CHAT: 'chat',
  SESSION: 'session',
  TOOL: 'tool',
  APPROVAL: 'approval',
  CRON: 'cron',
  AUTH: 'auth',
  PROBE: 'probe',
  TALK: 'talk',
  VOICEWAKE: 'voicewake',
  PRESENCE: 'presence',
  HEARTBEAT: 'heartbeat',
  UPDATE: 'update',
  SYSTEM: 'system',
  AGENT: 'agent',
  NODE: 'node',
  DEVICE: 'device',
  HEALTH: 'health',
} as const;

export type GatewayEventSource = typeof GATEWAY_EVENT_SOURCES[keyof typeof GATEWAY_EVENT_SOURCES];

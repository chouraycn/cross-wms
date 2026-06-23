/**
 * CDFKnow 四层对话架构 — 第1层：网关消息标准化层
 *
 * 统一封装消息结构、流式分片、工具卡片元数据。
 * 输出标准 Envelope 消息包，屏蔽多渠道差异。
 */

// ===================== 类型定义 =====================

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

/** 统一消息信封（所有渠道通用） */
export interface MessageEnvelope {
  id: string;
  role: MessageRole;
  content: string;
  meta?: MessageMeta;
  toolBlocks?: ToolBlock[];
  isStreaming: boolean;
  thinking?: string;
  thinkingDone?: boolean;
  timestamp: number;
}

/** SSE 事件类型 */
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
export function createUserEnvelope(content: string, sessionId: string): MessageEnvelope {
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
  };
}

/** 创建 AI 响应信封（流式） */
export function createAssistantEnvelope(sessionId: string, model: string): MessageEnvelope {
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

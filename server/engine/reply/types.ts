/**
 * Reply Dispatcher Types
 * 回复调度器类型定义
 */

export type ReplyDispatchKind = "normal" | "silent" | "system" | "error";

export interface ReplyPayload {
  id: string;
  content: string;
  role: "user" | "assistant" | "system" | "tool";
  timestamp: number;
  metadata?: ReplyPayloadMetadata;
  attachments?: Array<{
    type: string;
    content: string;
    mimeType?: string;
    name?: string;
  }>;
  toolCalls?: Array<{
    id: string;
    name: string;
    input: unknown;
  }>;
  toolResults?: Array<{
    id: string;
    result: unknown;
    isError?: boolean;
  }>;
}

export interface ReplyPayloadMetadata {
  sessionKey?: string;
  runId?: string;
  turnId?: string;
  model?: string;
  agent?: string;
  finishReason?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  latencyMs?: number;
  thinkingText?: string;
}

export interface ReplyDispatchRuntimeInfo {
  kind: ReplyDispatchKind;
  assistantMessageIndex?: number;
  sessionKey?: string;
  runId?: string;
}

export interface ReplyDispatchOptions {
  kind?: ReplyDispatchKind;
  delayMs?: number;
  typing?: {
    enabled: boolean;
    minSpeed?: number;
    maxSpeed?: number;
  };
  silent?: boolean;
}

export interface ReplyDispatcher {
  name: string;
  priority: number;
  canDispatch: (payload: ReplyPayload) => boolean;
  dispatch: (payload: ReplyPayload, info: ReplyDispatchRuntimeInfo) => Promise<void>;
}

export interface ReplyCoalescedUpdate {
  type: "text" | "tool_call" | "tool_result" | "thinking";
  content?: string;
  toolCallId?: string;
  toolName?: string;
  toolInput?: string;
  toolResult?: unknown;
  isError?: boolean;
  timestamp: number;
}

export type ReplyCoalescerFlushHandler = (
  updates: ReplyCoalescedUpdate[],
) => void | Promise<void>;

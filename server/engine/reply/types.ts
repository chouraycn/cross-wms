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
  fenceKey?: string;
  fenceGeneration?: number;
  visible?: boolean;
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

// ==================== Block Streaming Types ====================

export type BlockBreakPreference = "paragraph" | "newline" | "sentence";

export interface BlockStreamingChunkingConfig {
  minChars: number;
  maxChars: number;
  breakPreference: BlockBreakPreference;
  flushOnParagraph?: boolean;
}

export interface BlockStreamingCoalescingConfig {
  minChars: number;
  maxChars: number;
  idleMs: number;
  joiner: string;
  flushOnEnqueue?: boolean;
}

export type BlockReplyEventType =
  | "block_reply_text"
  | "block_reply_tool"
  | "block_reply_final"
  | "reasoning";

export interface BlockReplyTextEvent {
  type: "block_reply_text";
  content: string;
  blockIndex: number;
  isFinal: boolean;
  timestamp: number;
}

export interface BlockReplyToolEvent {
  type: "block_reply_tool";
  toolCallId: string;
  toolName: string;
  toolInput?: string;
  toolResult?: unknown;
  isError?: boolean;
  timestamp: number;
}

export interface BlockReplyFinalEvent {
  type: "block_reply_final";
  content: string;
  totalBlocks: number;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

export interface ReasoningEvent {
  type: "reasoning";
  content: string;
  done: boolean;
  timestamp: number;
}

export type BlockReplyEvent =
  | BlockReplyTextEvent
  | BlockReplyToolEvent
  | BlockReplyFinalEvent
  | ReasoningEvent;

export type BlockReplyEventHandler = (event: BlockReplyEvent) => void | Promise<void>;

export interface FenceSpan {
  start: number;
  end: number;
  openLine: string;
  marker: string;
  indent: string;
}

export interface FenceScanState {
  atLineStart?: boolean;
  open?: {
    markerChar: string;
    markerLen: number;
    openLine: string;
    marker: string;
    indent: string;
  };
}

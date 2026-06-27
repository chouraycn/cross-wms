/**
 * ACP Types
 * ACP 协议类型定义
 */

export interface AcpSessionCreateRequest {
  sessionId?: string;
  name?: string;
  metadata?: Record<string, unknown>;
}

export interface AcpSessionCloseRequest {
  sessionId: string;
}

export interface AcpTurnRequest {
  sessionId: string;
  messages: Array<{
    role: "user" | "assistant" | "system" | "tool";
    content: string;
  }>;
  model?: string;
  tools?: Array<{
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  }>;
  tool_choice?: string | Record<string, unknown>;
  temperature?: number;
  maxTokens?: number;
  thinking?: {
    mode: "disabled" | "auto" | "enabled";
    budgetTokens?: number;
  };
  metadata?: Record<string, unknown>;
}

export type AcpTurnEvent =
  | { type: "text_delta"; text: string; stream?: "main" | "thought" }
  | { type: "thinking_delta"; text: string }
  | { type: "tool_call"; id: string; name: string; input: unknown }
  | { type: "tool_call_delta"; id: string; inputDelta: string }
  | { type: "tool_result"; id: string; result: unknown; isError?: boolean }
  | { type: "content_block"; block: ContentBlock }
  | { type: "usage"; promptTokens: number; completionTokens: number; totalTokens: number }
  | { type: "done"; finishReason?: string; usage?: { promptTokens: number; completionTokens: number; totalTokens: number } }
  | { type: "error"; error: string; code?: string };

export interface ContentBlock {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
}

export interface TurnResult {
  content?: string;
  thinkingText?: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  contentBlocks?: ContentBlock[];
  finishReason?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  durationMs?: number;
  startedAt?: number;
  completedAt?: number;
}

export interface ToolCall {
  id: string;
  name: string;
  input: string | Record<string, unknown>;
}

export interface ToolResult {
  id: string;
  result: unknown;
  isError?: boolean;
}

export type AgentStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'error';

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export type QueueMode = "all" | "one-at-a-time";

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export interface MessageContent {
  type: 'text' | 'image' | 'audio' | 'file';
  text?: string;
  url?: string;
  mimeType?: string;
  filename?: string;
}

// Re-export OpenClaw-compatible message types from llm-core
export type {
  Message,
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  TextContent,
  ImageContent,
  ThinkingContent,
  ToolCall as LlmToolCall,
  Usage,
  StopReason,
  Model,
  Context,
  StreamFn,
  CompleteSimpleFn,
  SimpleStreamOptions,
  Tool,
} from "@cdf-know/llm-core";

// Re-export from llm-core for convenience
import type {
  Message,
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  TextContent,
  ImageContent,
  ThinkingContent,
  ToolCall as LlmToolCall,
  Usage,
} from "@cdf-know/llm-core";

/** Bash execution transcript message. */
export interface BashExecutionMessage {
  role: "bashExecution";
  command: string;
  output: string;
  exitCode: number | undefined;
  cancelled: boolean;
  truncated: boolean;
  fullOutputPath?: string;
  timestamp: number;
  excludeFromContext?: boolean;
}

/** Custom application message. */
export interface CustomMessage<T = unknown> {
  role: "custom";
  customType: string;
  content: string | (TextContent | ImageContent)[];
  display: boolean;
  details?: T;
  timestamp: number;
}

/** Branch summary message. */
export interface BranchSummaryMessage {
  role: "branchSummary";
  summary: string;
  fromId: string;
  timestamp: number;
}

/** Compaction summary message. */
export interface CompactionSummaryMessage {
  role: "compactionSummary";
  summary: string;
  tokensBefore: number;
  timestamp: number | string;
  tokensAfter?: number;
  firstKeptEntryId?: string;
  details?: unknown;
}

/** Agent message union type compatible with OpenClaw. */
export type AgentMessage = Message | BashExecutionMessage | CustomMessage | BranchSummaryMessage | CompactionSummaryMessage;

/** Agent events emitted by the agent loop. */
export type AgentEvent =
  | { type: "agent_start" }
  | { type: "agent_end"; messages: AgentMessage[] }
  | { type: "turn_start" }
  | { type: "turn_end"; message: AgentMessage; toolResults: ToolResultMessage[] }
  | { type: "message_start"; message: AgentMessage }
  | { type: "message_update"; message: AgentMessage; assistantMessageEvent: unknown }
  | { type: "message_end"; message: AgentMessage }
  | { type: "tool_execution_start"; toolCallId: string; toolName: string; args: unknown }
  | { type: "tool_execution_update"; toolCallId: string; toolName: string; args: unknown; partialResult: unknown }
  | { type: "tool_execution_end"; toolCallId: string; toolName: string; result: unknown; isError: boolean; executionStarted?: boolean };

export interface TraceSpan {
  id: string;
  name: string;
  parentId?: string;
  startTime: number;
  endTime?: number;
  attributes: Record<string, unknown>;
  events: Array<{ name: string; timestamp: number; attributes?: Record<string, unknown> }>;
  status: 'pending' | 'running' | 'completed' | 'error';
}

export interface CompactionOptions {
  strategy: 'summary' | 'truncate' | 'branch-summarization';
  maxTokens?: number;
  preserveRecent?: number;
  summaryModel?: string;
}

/** Tool definition used by the agent harness. */
export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (toolCallId: string, params: unknown, signal?: AbortSignal) => Promise<unknown>;
}

/** Context snapshot passed into the agent loop. */
export interface AgentContext {
  systemPrompt: string;
  messages: AgentMessage[];
  tools?: AgentTool[];
}

/** Legacy type aliases for backward compatibility. */
export type ToolCall = LlmToolCall;
export type ToolDefinition = import("@cdf-know/llm-core").Tool;
export type TokenUsage = Usage;
export type AgentEventType = AgentEvent["type"];

/** Reasoning step used by the reasoning engine. */
export interface ReasoningStep {
  id: string;
  type: 'thought' | 'plan' | 'observation' | 'reflection';
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/** Agent runtime dependencies. */
export interface AgentRuntimeDeps {
  completeSimple: (
    model: string,
    messages: AgentMessage[],
    options?: Record<string, unknown>,
  ) => Promise<{ content: string; usage?: TokenUsage }>;
  streamSimple: (
    model: string,
    messages: AgentMessage[],
    options?: Record<string, unknown>,
  ) => AsyncGenerator<{
    type: 'token' | 'start' | 'finish' | 'tool_call' | 'error';
    content?: string;
    toolCalls?: ToolCall[];
    usage?: TokenUsage;
    error?: string;
  }>;
}

/** Agent options for creating an agent. */
export interface AgentOptions {
  model?: string;
  systemPrompt?: string;
  tools?: ToolDefinition[];
  maxIterations?: number;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  reasoningEnabled?: boolean;
  runtime?: AgentRuntimeDeps;
}

/** Agent run parameters. */
export interface AgentRunParams {
  messages: AgentMessage[];
  tools?: ToolDefinition[];
  systemPrompt?: string;
  model?: string;
  signal?: AbortSignal;
  metadata?: Record<string, unknown>;
}

/** Agent run result. */
export interface AgentRunResult {
  content: string;
  thinkingContent?: string;
  toolCalls?: ToolCall[];
  messages: AgentMessage[];
  usage?: TokenUsage;
  duration: number;
  iterations: number;
  error?: string;
}

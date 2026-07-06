export type AgentStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'error';

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface MessageContent {
  type: 'text' | 'image' | 'audio' | 'file';
  text?: string;
  url?: string;
  mimeType?: string;
  filename?: string;
}

export interface AgentMessage {
  id: string;
  role: MessageRole;
  content: string | MessageContent[];
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ReasoningStep {
  id: string;
  type: 'thought' | 'plan' | 'observation' | 'reflection';
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

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

export interface AgentRunParams {
  messages: AgentMessage[];
  tools?: ToolDefinition[];
  systemPrompt?: string;
  model?: string;
  signal?: AbortSignal;
  metadata?: Record<string, unknown>;
}

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

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

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

export type AgentEventType =
  | 'start'
  | 'token'
  | 'thinking'
  | 'tool_call'
  | 'tool_result'
  | 'iteration'
  | 'finish'
  | 'error'
  | 'status_change';

export interface AgentEvent {
  type: AgentEventType;
  runId: string;
  timestamp: number;
  data?: unknown;
}

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

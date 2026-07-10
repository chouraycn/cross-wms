/**
 * @cdf-know/agent-core STABLE API 契约声明
 *
 * 本文件定义了 @cdf-know/agent-core 包中所有 STABLE 等级公共 API 的
 * 类型契约。任何 STABLE API 的移除或签名变更均视为破坏性变更。
 *
 * 仅供契约检查脚本使用，不应被其他包直接导入。
 */

// ── 核心类型 ──

export type AgentStatus = string;
export type MessageRole = string;
export type MessageContent = string;
export type TokenUsage = object;
export type AgentEventType = string;
export type CompactionOptions = object;

export interface AgentMessage {
  role: MessageRole;
  content: MessageContent;
  toolCalls?: ToolCall[];
  usage?: TokenUsage;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ReasoningStep {
  type: string;
  content: string;
  timestamp?: number;
}

export interface AgentOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  tools?: ToolDefinition[];
}

export interface AgentRunParams {
  messages: AgentMessage[];
  maxSteps?: number;
}

export interface AgentRunResult {
  messages: AgentMessage[];
  usage: TokenUsage;
  status: AgentStatus;
}

export interface AgentEvent {
  type: AgentEventType;
  data: unknown;
  timestamp: number;
}

export interface TraceSpan {
  id: string;
  name: string;
  startTime: number;
  endTime?: number;
  metadata?: Record<string, unknown>;
}

// ── 核心类 ──

export interface AgentEvents {
  [key: string]: unknown;
}

export declare class Agent {
  constructor(options: AgentOptions);
  run(params: AgentRunParams): Promise<AgentRunResult>;
  stop(): void;
  getStatus(): AgentStatus;
  getTracer(): Tracer;
  getCurrentRunId(): string | undefined;
  getOptions(): AgentOptions;
  setOptions(options: Partial<AgentOptions>): void;
}

export declare class Tracer {
  startSpan(name: string, metadata?: Record<string, unknown>): TraceSpan;
  endSpan(span: TraceSpan): void;
  getSpans(): TraceSpan[];
  clear(): void;
}

export declare const globalTracer: Tracer;
export declare function trace(name: string, fn: (...args: unknown[]) => unknown): unknown;

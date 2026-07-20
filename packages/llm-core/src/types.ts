import type { TSchema } from "typebox";

// Types needed by validation.ts and event-stream.ts

/** Normalized assistant tool call emitted by providers or repaired from text. */
export interface ToolCall {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  thoughtSignature?: string;
  executionMode?: "sequential" | "parallel";
}

/** Provider tool declaration with a TypeBox/JSON-schema parameter object. */
export interface Tool<TParameters extends TSchema = TSchema> {
  name: string;
  description: string;
  parameters: TParameters;
}

/** Normalized assistant stop reasons across text providers. */
export type StopReason = "stop" | "length" | "toolUse" | "error" | "aborted";

/** Plain assistant/user text content block. */
export interface TextContent {
  type: "text";
  text: string;
  textSignature?: string;
}

/** Provider reasoning/thinking content block. */
export interface ThinkingContent {
  type: "thinking";
  thinking: string;
  thinkingSignature?: string;
  redacted?: boolean;
}

/** Normalized token and cost accounting for a provider response. */
export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}

/** Assistant turn, including provider identity and final stop state. */
export interface AssistantMessage {
  role: "assistant";
  content: (TextContent | ThinkingContent | ToolCall)[];
  api: string;
  provider: string;
  model: string;
  responseModel?: string;
  responseId?: string;
  usage: Usage;
  stopReason: StopReason;
  errorMessage?: string;
  errorCode?: string;
  errorType?: string;
  errorBody?: string;
  timestamp: number;
}

/**
 * Event protocol for AssistantMessageEventStream.
 * Streams emit events with discriminated type field.
 */
export type AssistantMessageEvent =
  | { type: "start"; partial: AssistantMessage }
  | { type: "text_start"; contentIndex: number; partial: AssistantMessage }
  | { type: "text_delta"; contentIndex: number; delta: string; partial?: AssistantMessage }
  | { type: "text_end"; contentIndex: number; content: string; partial: AssistantMessage }
  | { type: "thinking_start"; contentIndex: number; partial: AssistantMessage }
  | { type: "thinking_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
  | { type: "thinking_end"; contentIndex: number; content: string; partial: AssistantMessage }
  | { type: "toolcall_start"; contentIndex: number; partial: AssistantMessage }
  | { type: "toolcall_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
  | { type: "toolcall_end"; contentIndex: number; toolCall: ToolCall; partial: AssistantMessage }
  | { type: "done"; reason: Extract<StopReason, "stop" | "length" | "toolUse">; message: AssistantMessage }
  | { type: "error"; reason: Extract<StopReason, "aborted" | "error">; error: AssistantMessage };

export interface AssistantMessageEventStreamContract extends AsyncIterable<AssistantMessageEvent> {
  /** Queue one stream event for consumers. */
  push(event: AssistantMessageEvent): void;
  /** Complete the stream and optionally resolve the final message. */
  end(result?: AssistantMessage): void;
  /** Final assistant message produced by the stream. */
  result(): Promise<AssistantMessage>;
}

// Model catalog types

export type ModelKind = 'llm' | 'embedding' | 'tts' | 'stt' | 'image' | 'video';

export type ModelCapability =
  | 'chat'
  | 'complete'
  | 'streaming'
  | 'tool_calls'
  | 'function_calling'
  | 'vision'
  | 'image_input'
  | 'json_mode'
  | 'seed'
  | 'stop_sequences'
  | 'logprobs'
  | 'reasoning'
  | 'long_context';

export interface ModelPricing {
  inputPerToken?: number;
  outputPerToken?: number;
  perRequest?: number;
  perImage?: number;
  perMinuteAudio?: number;
  currency?: string;
}

export interface ModelContextWindow {
  maxTokens: number;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  maxImageSize?: number;
  maxAudioDuration?: number;
}

export interface ModelRateLimits {
  requestsPerMinute?: number;
  tokensPerMinute?: number;
  requestsPerDay?: number;
  tokensPerDay?: number;
}

export interface UnifiedModelCatalogEntry {
  id: string;
  name: string;
  kind: ModelKind;
  provider: string;
  providerModelId: string;
  description?: string;
  tags?: string[];
  capabilities: ModelCapability[];
  contextWindow: ModelContextWindow;
  pricing: ModelPricing;
  rateLimits?: ModelRateLimits;
  defaultConfig?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
  };
  deprecated?: boolean;
  releaseDate?: string;
  supportsStreaming?: boolean;
  supportsTools?: boolean;
  isFreeTier?: boolean;
}

export interface ModelCatalogSource {
  id: string;
  name: string;
  models: UnifiedModelCatalogEntry[];
  lastUpdated: number;
}

export interface ModelFilterOptions {
  kind?: ModelKind;
  provider?: string;
  capabilities?: ModelCapability[];
  maxPricePer1kInput?: number;
  minContextWindow?: number;
  deprecated?: boolean;
  search?: string;
  tags?: string[];
}

export type ModelSortBy =
  | 'name'
  | 'context_window'
  | 'price_input'
  | 'price_output'
  | 'provider';

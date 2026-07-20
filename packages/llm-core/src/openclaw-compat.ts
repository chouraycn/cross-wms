// OpenClaw llm-core 兼容类型
// 为 agent-core 等 OpenClaw 包提供类型兼容层

// Re-export shared types from ./types to avoid duplication
export type {
  AssistantMessage,
  AssistantMessageEvent,
  AssistantMessageEventStreamContract,
  StopReason,
  TextContent,
  ThinkingContent,
  Tool,
  ToolCall,
  Usage,
} from "./types";

// Import shared types for local use
import type {
  AssistantMessageEventStreamContract as IAssistantMessageEventStreamContract,
  AssistantMessage as IAssistantMessage,
  AssistantMessageEvent as IAssistantMessageEvent,
  TextContent as ITextContent,
  ToolCall as IToolCall,
  Tool as ITool,
  StopReason as IStopReason,
} from "./types";

export type KnownApi =
  | "anthropic"
  | "bedrock"
  | "gemini"
  | "ollama"
  | "openai"
  | "openrouter"
  | "perplexity"
  | "cloudflare"
  | "azure-openai"
  | "groq"
  | "cohere"
  | "deepseek"
  | "mistral"
  | "xai"
  | "togetherai";

export type Api = KnownApi | (string & {});

export type Provider = string;

/** Streaming transport preference for providers that support multiple transports. */
export type Transport = "sse" | "websocket" | "websocket-cached" | "auto";

/** Normalized reasoning-effort levels shared across provider-specific knobs. */
export type ThinkingLevel = "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
/** Model thinking setting including explicit disabled state. */
export type ModelThinkingLevel = "off" | ThinkingLevel;

/** Prompt-cache retention preference shared by providers that expose cache controls. */
export type CacheRetention = "none" | "short" | "long";

export interface StreamOptions {
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
  signal?: AbortSignal;
  apiKey?: string;
  transport?: Transport;
  cacheRetention?: CacheRetention;
  sessionId?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxRetries?: number;
  maxRetryDelayMs?: number;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SimpleStreamOptions extends StreamOptions {
  reasoning?: ThinkingLevel;
}

export type ProviderStreamOptions = StreamOptions & Record<string, unknown>;

/** Base64 image content block with MIME type metadata. */
export interface ImageContent {
  type: "image";
  data: string;
  mimeType: string;
}

/** User turn in a text-model conversation. */
export interface UserMessage {
  role: "user";
  content: string | (ITextContent | ImageContent)[];
  timestamp: number;
}

/** Tool result turn that answers a prior assistant tool call. */
export interface ToolResultMessage<TDetails = unknown> {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: (ITextContent | ImageContent)[];
  details?: TDetails;
  isError: boolean;
  timestamp: number;
}

/** Any text-model conversation message supported by LLM core. */
export type Message = UserMessage | IAssistantMessage | ToolResultMessage;

/** Text-model request context shared by provider adapters. */
export interface Context {
  systemPrompt?: string;
  messages: Message[];
  tools?: ITool[];
}

/** Read-only stream contract accepted by consumers that do not need to push events. */
export interface AssistantMessageEventStreamLike extends AsyncIterable<IAssistantMessageEvent> {
  result(): Promise<IAssistantMessage>;
}

export type StreamFn = (
  model: Model,
  context: Context,
  options?: SimpleStreamOptions,
) => AssistantMessageEventStreamLike | Promise<AssistantMessageEventStreamLike>;

export type CompleteSimpleFn = (
  model: Model,
  context: Pick<Context, "systemPrompt" | "messages">,
  options?: SimpleStreamOptions,
) => Promise<IAssistantMessage>;

export type StreamFunction<
  TApi extends Api = Api,
  TOptions extends StreamOptions = StreamOptions,
> = (
  model: Model<TApi>,
  context: Context,
  options?: TOptions,
) => IAssistantMessageEventStreamContract;

export interface ModelCost {
  input: number;
  output: number;
}

export interface Model<TApi extends Api = Api> {
  id: string;
  name: string;
  api: TApi;
  provider: string;
  contextWindow?: number;
  maxTokens?: number;
  supportsStreaming?: boolean;
  supportsTools?: boolean;
  reasoning?: boolean;
  cost?: ModelCost;
  [key: string]: unknown;
}

export interface ImagesModel<TApi extends Api = Api>
  extends Omit<Model<TApi>, "api"> {
  api: TApi;
}

export interface ImagesContext {
  prompt: string;
  images?: Array<{ url: string; detail?: "low" | "high" | "auto" }>;
}

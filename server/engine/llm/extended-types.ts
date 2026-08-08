import type { Api, Model as BaseModel, Usage as BaseUsage, ModelThinkingLevel } from './types.js';
import type {
  AssistantMessageEvent,
  AssistantMessageEventStreamContract,
  ToolCall,
  TextContent,
  ThinkingContent,
  StopReason,
  AssistantMessage,
} from './utils/event-stream.js';

export {
  ToolCall,
  TextContent,
  ThinkingContent,
  StopReason,
  AssistantMessage,
  AssistantMessageEvent,
  AssistantMessageEventStreamContract,
};

export type { Api, ModelThinkingLevel };

export type Transport = "sse" | "websocket" | "websocket-cached" | "auto";

export type Model<TApi extends Api = Api> = BaseModel<TApi> & {
  input?: string[];
  params?: Record<string, any>;
  baseUrl?: string;
  compat?: OpenAICompletionsCompat;
  headers?: Record<string, string>;
  reasoning?: boolean;
  thinkingLevelMap?: Partial<Record<ModelThinkingLevel, string | null>>;
};

export type CacheRetention = "none" | "short" | "long";

export type ThinkingBudgets = {
  off: number;
  minimal: number;
  low: number;
  medium: number;
  high: number;
  max: number;
};

export type ThinkingLevel = ModelThinkingLevel;

export type ImageContent = {
  type: "image";
  data: string;
  mimeType: string;
};

export type ToolResultMessage = {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: (TextContent | ImageContent)[];
  isError?: boolean;
  timestamp?: number;
};

export type UserMessage = {
  role: "user";
  content: string | (TextContent | ImageContent)[];
  timestamp?: number;
};

export type SystemMessage = {
  role: "system";
  content: string;
  timestamp?: number;
};

export type Message = SystemMessage | UserMessage | AssistantMessage | ToolResultMessage;

export type Context = {
  messages: Message[];
  systemPrompt?: string;
  tools?: Tool[];
};

export type Tool = {
  name: string;
  description: string;
  parameters: Record<string, any>;
};

export type SimpleStreamOptions = {
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
  signal?: AbortSignal;
  apiKey?: string;
  transport?: Transport;
  cacheRetention?: CacheRetention;
  sessionId?: string;
  promptCacheKey?: string;
  headers?: Record<string, string>;
  onPayload?: (payload: any, model: Model) => unknown | Promise<any>;
  onResponse?: (response: Response) => void;
  timeoutMs?: number;
  maxRetries?: number;
  maxRetryDelayMs?: number;
  metadata?: Record<string, any>;
  reasoning?: {
    level?: ThinkingLevel;
    budgetTokens?: number;
  };
};

export type StreamOptions = SimpleStreamOptions & {
  thinkingLevel?: ThinkingLevel;
};

export type StreamFunction<TApi extends Api = Api, TOptions extends StreamOptions = StreamOptions> = (
  model: Model<TApi>,
  context: Context,
  options?: TOptions,
) => AssistantMessageEventStreamContract;

export type Usage = BaseUsage & {
  totalTokens: number;
};

export type TextSignatureV1 = {
  v: 1;
  id: string;
  phase?: "commentary" | "final_answer";
};

export type OpenAICompletionsCompat = {
  supportsParallelToolCalls?: boolean;
  supportsStreamingToolCalls?: boolean;
};

export type SimpleModel = {
  id: string;
  baseUrl?: string;
  headers?: Record<string, string>;
  input?: string[];
  params?: Record<string, any>;
  compat?: OpenAICompletionsCompat;
  reasoning?: boolean;
  thinkingLevelMap?: Partial<Record<ModelThinkingLevel, string | null>>;
};

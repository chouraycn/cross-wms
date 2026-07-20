export type LlmMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface LlmMessage {
  role: LlmMessageRole;
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

export interface LlmConfig {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
  seed?: number;
  responseFormat?: { type: 'text' | 'json_object' };
}

export interface LlmToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LlmResponse {
  content: string;
  toolCalls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  usage?: LlmUsage;
  model: string;
  finishReason: string;
}

export type StreamEventType =
  | 'start'
  | 'token'
  | 'tool_call'
  | 'finish'
  | 'error'
  | 'usage';

export interface LlmStreamEvent {
  type: StreamEventType;
  content?: string;
  toolCalls?: LlmResponse['toolCalls'];
  usage?: LlmUsage;
  error?: string;
  model?: string;
  finishReason?: string;
}

export type LlmCompleteSimpleFn = (
  model: string,
  messages: LlmMessage[],
  options?: LlmConfig & { tools?: LlmToolDefinition[] },
) => Promise<LlmResponse>;

export type LlmStreamSimpleFn = (
  model: string,
  messages: LlmMessage[],
  options?: LlmConfig & { tools?: LlmToolDefinition[] },
) => AsyncGenerator<LlmStreamEvent>;

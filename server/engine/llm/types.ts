export type Api =
  | 'openai-completions'
  | 'openai-responses'
  | 'anthropic-messages'
  | 'google-gemini'
  | 'mistral-chat'
  | 'azure-openai'
  | 'cloudflare-ai'
  | 'github-copilot';

export type ModelThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export type ModelCost = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
};

export type Usage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
};

export type Model<TApi extends Api = Api> = {
  id: string;
  name: string;
  provider: string;
  api: TApi;
  contextWindow: number;
  maxOutputTokens?: number;
  cost: ModelCost;
  reasoning?: boolean;
  thinkingLevelMap?: Partial<Record<ModelThinkingLevel, string | null>>;
  capabilities?: string[];
  description?: string;
  aliases?: string[];
};

export type StreamEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_call'; toolName: string; arguments: Record<string, unknown> }
  | { type: 'tool_result'; toolName: string; result: unknown }
  | { type: 'usage'; usage: Usage }
  | { type: 'done'; usage: Usage }
  | { type: 'error'; error: string };

export type CompleteOptions = {
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>;
  temperature?: number;
  maxTokens?: number;
  tools?: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
  thinkingLevel?: ModelThinkingLevel;
  signal?: AbortSignal;
};

export type StreamOptions = CompleteOptions & {
  onEvent?: (event: StreamEvent) => void;
};

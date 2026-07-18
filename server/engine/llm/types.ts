export type Api =
  | 'openai-completions'
  | 'openai-responses'
  | 'anthropic-messages'
  | 'google-gemini'
  | 'mistral-chat'
  | 'azure-openai'
  | 'cloudflare-ai'
  | 'github-copilot'
  | 'aws-bedrock'
  | 'ollama'
  | 'deepseek-chat'
  | 'moonshot-chat'
  | 'qwen-chat'
  | 'zhipu-chat'
  | 'minimax-chat'
  | 'baichuan-chat'
  | 'ernie-chat'
  | 'spark-chat'
  | 'yi-chat';

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
  | { type: 'thinking'; content: string }
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
  /** 用户标识（用于国内厂商合规审计） */
  userId?: string;
};

export type StreamOptions = CompleteOptions & {
  onEvent?: (event: StreamEvent) => void;
};

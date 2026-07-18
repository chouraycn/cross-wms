import { z } from 'zod';

export const ProviderConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['openai', 'anthropic', 'google', 'azure', 'local']),
  apiKey: z.string().optional(),
  endpoint: z.string().optional(),
  model: z.string().default('gpt-4o'),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().min(1).default(4096),
  timeoutMs: z.number().min(1000).default(120000),
  enabled: z.boolean().default(true),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
}

export interface ChatCompletionOptions {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  tools?: Array<{
    type: string;
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
  toolChoice?: 'none' | 'auto' | { type: string; function: { name: string } };
  stream?: boolean;
  timeoutMs?: number;
}

export interface ChatCompletionResult {
  id: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finishReason: string;
    toolCalls?: Array<{
      id: string;
      type: string;
      function: {
        name: string;
        arguments: string;
      };
    }>;
  }>;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  createdAt: number;
}

export interface EmbeddingOptions {
  input: string | string[];
  model?: string;
}

export interface EmbeddingResult {
  embeddings: number[][];
  usage?: {
    promptTokens: number;
    totalTokens: number;
  };
}
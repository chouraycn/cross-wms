import type { ProviderConfig, ChatCompletionOptions, ChatCompletionResult, EmbeddingOptions, EmbeddingResult, ChatMessage } from './types.js';
import { ProviderConfigSchema } from './types.js';

export interface LlmProvider {
  readonly config: ProviderConfig;

  chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResult>;
  streamChatCompletion(options: ChatCompletionOptions): AsyncGenerator<ChatCompletionResult>;
  embedding(options: EmbeddingOptions): Promise<EmbeddingResult>;

  getModelInfo(modelId: string): Promise<{
    id: string;
    name: string;
    contextWindow: number;
    maxOutputTokens: number;
  } | undefined>;
  listModels(): Promise<string[]>;

  isAvailable(): Promise<boolean>;
}

export abstract class BaseLlmProvider implements LlmProvider {
  readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = ProviderConfigSchema.parse(config);
  }

  abstract chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResult>;

  async *streamChatCompletion(options: ChatCompletionOptions): AsyncGenerator<ChatCompletionResult> {
    const result = await this.chatCompletion({ ...options, stream: false });
    yield result;
  }

  abstract embedding(options: EmbeddingOptions): Promise<EmbeddingResult>;

  async getModelInfo(modelId: string): Promise<{
    id: string;
    name: string;
    contextWindow: number;
    maxOutputTokens: number;
  } | undefined> {
    return undefined;
  }

  async listModels(): Promise<string[]> {
    return [];
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.chatCompletion({
        messages: [{ role: 'user', content: 'ping' }],
        maxTokens: 1,
      });
      return true;
    } catch {
      return false;
    }
  }

  protected buildMessages(options: ChatCompletionOptions): ChatMessage[] {
    return options.messages;
  }

  protected generateId(): string {
    return `chatcmpl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
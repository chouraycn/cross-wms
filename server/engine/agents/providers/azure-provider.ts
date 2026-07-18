import { logger } from '../../../logger.js';
import type { ProviderConfig, ChatCompletionOptions, ChatCompletionResult, EmbeddingOptions, EmbeddingResult } from './types.js';
import { BaseLlmProvider } from './base-provider.js';

export class AzureProvider extends BaseLlmProvider {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(config: ProviderConfig) {
    super(config);
    this.baseUrl = config.endpoint ?? '';
    this.headers = {
      'Content-Type': 'application/json',
      'api-key': config.apiKey ?? '',
    };
  }

  async chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
    if (!this.baseUrl) {
      throw new Error('Azure endpoint is not configured');
    }

    const url = `${this.baseUrl}/chat/completions?api-version=2024-02-15-preview`;
    const body = {
      model: options.model ?? this.config.model,
      messages: options.messages,
      temperature: options.temperature ?? this.config.temperature,
      max_tokens: options.maxTokens ?? this.config.maxTokens,
      tools: options.tools,
      tool_choice: options.toolChoice,
      stream: false,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs ?? this.config.timeoutMs),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`Azure API error: ${error.message}`);
    }

    const data = await response.json();

    return {
      id: data.id,
      choices: data.choices.map((choice: unknown) => ({
        index: (choice as Record<string, unknown>).index as number,
        message: (choice as Record<string, unknown>).message as ChatCompletionResult['choices'][0]['message'],
        finishReason: (choice as Record<string, unknown>).finish_reason as string,
        toolCalls: (choice as Record<string, unknown>).tool_calls as ChatCompletionResult['choices'][0]['toolCalls'],
      })),
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
      createdAt: Date.now(),
    };
  }

  async *streamChatCompletion(options: ChatCompletionOptions): AsyncGenerator<ChatCompletionResult> {
    if (!this.baseUrl) {
      throw new Error('Azure endpoint is not configured');
    }

    const url = `${this.baseUrl}/chat/completions?api-version=2024-02-15-preview`;
    const body = {
      model: options.model ?? this.config.model,
      messages: options.messages,
      temperature: options.temperature ?? this.config.temperature,
      max_tokens: options.maxTokens ?? this.config.maxTokens,
      tools: options.tools,
      tool_choice: options.toolChoice,
      stream: true,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs ?? this.config.timeoutMs),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`Azure API error: ${error.message}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;

        const data = line.substring(6);
        if (data === '[DONE]') continue;

        try {
          const event = JSON.parse(data);
          yield {
            id: event.id,
            choices: event.choices.map((choice: unknown) => ({
              index: (choice as Record<string, unknown>).index as number,
              message: (choice as Record<string, unknown>).delta as ChatCompletionResult['choices'][0]['message'],
              finishReason: (choice as Record<string, unknown>).finish_reason as string,
            })),
            createdAt: Date.now(),
          };
        } catch {
          // ignore parsing errors
        }
      }
    }
  }

  async embedding(options: EmbeddingOptions): Promise<EmbeddingResult> {
    if (!this.baseUrl) {
      throw new Error('Azure endpoint is not configured');
    }

    const url = `${this.baseUrl}/embeddings?api-version=2024-02-15-preview`;
    const body = {
      model: options.model ?? 'text-embedding-3-small',
      input: options.input,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`Azure API error: ${error.message}`);
    }

    const data = await response.json();

    return {
      embeddings: data.data.map((item: unknown) => (item as Record<string, unknown>).embedding as number[]),
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
    };
  }

  async listModels(): Promise<string[]> {
    return ['gpt-4', 'gpt-4-turbo', 'gpt-35-turbo', 'text-embedding-3-small'];
  }
}

logger.debug('[Agents:AzureProvider] Module loaded');
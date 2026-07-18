import { logger } from '../../../logger.js';
import type { ProviderConfig, ChatCompletionOptions, ChatCompletionResult, EmbeddingOptions, EmbeddingResult } from './types.js';
import { BaseLlmProvider } from './base-provider.js';

export class OpenAIProvider extends BaseLlmProvider {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(config: ProviderConfig) {
    super(config);
    this.baseUrl = config.endpoint ?? 'https://api.openai.com/v1';
    this.headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    };
  }

  async chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
    const url = `${this.baseUrl}/chat/completions`;
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
      throw new Error(`OpenAI API error: ${error.message}`);
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
    const url = `${this.baseUrl}/chat/completions`;
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
      throw new Error(`OpenAI API error: ${error.message}`);
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
    const url = `${this.baseUrl}/embeddings`;
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
      throw new Error(`OpenAI API error: ${error.message}`);
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
    const url = `${this.baseUrl}/models`;

    try {
      const response = await fetch(url, {
        headers: this.headers,
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });

      if (!response.ok) return [];

      const data = await response.json();
      return data.data.map((model: unknown) => (model as Record<string, unknown>).id as string);
    } catch {
      return [];
    }
  }
}

logger.debug('[Agents:OpenAIProvider] Module loaded');
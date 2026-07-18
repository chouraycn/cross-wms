import { logger } from '../../../logger.js';
import type { ProviderConfig, ChatCompletionOptions, ChatCompletionResult, EmbeddingOptions, EmbeddingResult } from './types.js';
import { BaseLlmProvider } from './base-provider.js';

export class AnthropicProvider extends BaseLlmProvider {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(config: ProviderConfig) {
    super(config);
    this.baseUrl = config.endpoint ?? 'https://api.anthropic.com/v1';
    this.headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
      'anthropic-version': '2023-06-01',
    };
  }

  async chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
    const url = `${this.baseUrl}/messages`;
    const body = {
      model: options.model ?? this.config.model,
      messages: options.messages.filter(m => m.role !== 'system'),
      system: options.messages.find(m => m.role === 'system')?.content,
      temperature: options.temperature ?? this.config.temperature,
      max_tokens: options.maxTokens ?? this.config.maxTokens,
      tools: options.tools?.map(t => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      })),
      tool_choice: options.toolChoice,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs ?? this.config.timeoutMs),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`Anthropic API error: ${error.message}`);
    }

    const data = await response.json();

    return {
      id: data.id,
      choices: [{
        index: 0,
        message: {
          role: 'assistant' as const,
          content: typeof data.content === 'string' ? data.content : JSON.stringify(data.content),
        },
        finishReason: data.stop_reason ?? 'end_turn',
        toolCalls: data.tool_calls?.map((tc: unknown) => ({
          id: (tc as Record<string, unknown>).id as string,
          type: 'function',
          function: {
            name: (tc as Record<string, unknown>).name as string,
            arguments: JSON.stringify((tc as Record<string, unknown>).input as Record<string, unknown>),
          },
        })),
      }],
      createdAt: Date.now(),
    };
  }

  async *streamChatCompletion(options: ChatCompletionOptions): AsyncGenerator<ChatCompletionResult> {
    const url = `${this.baseUrl}/messages`;
    const body = {
      model: options.model ?? this.config.model,
      messages: options.messages.filter(m => m.role !== 'system'),
      system: options.messages.find(m => m.role === 'system')?.content,
      temperature: options.temperature ?? this.config.temperature,
      max_tokens: options.maxTokens ?? this.config.maxTokens,
      tools: options.tools?.map(t => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      })),
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
      throw new Error(`Anthropic API error: ${error.message}`);
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
          if (event.type === 'content_block_delta') {
            yield {
              id: event.message.id,
              choices: [{
                index: 0,
                message: {
                  role: 'assistant' as const,
                  content: (event.delta as Record<string, unknown>).text as string ?? '',
                },
                finishReason: '',
              }],
              createdAt: Date.now(),
            };
          }
        } catch {
          // ignore parsing errors
        }
      }
    }
  }

  async embedding(options: EmbeddingOptions): Promise<EmbeddingResult> {
    throw new Error('Anthropic does not support embeddings');
  }

  async listModels(): Promise<string[]> {
    return ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307', 'claude-2.1'];
  }
}

logger.debug('[Agents:AnthropicProvider] Module loaded');
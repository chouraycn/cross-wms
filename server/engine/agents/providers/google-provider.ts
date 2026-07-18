import { logger } from '../../../logger.js';
import type { ProviderConfig, ChatCompletionOptions, ChatCompletionResult, EmbeddingOptions, EmbeddingResult } from './types.js';
import { BaseLlmProvider } from './base-provider.js';

export class GoogleProvider extends BaseLlmProvider {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(config: ProviderConfig) {
    super(config);
    this.baseUrl = config.endpoint ?? 'https://generativelanguage.googleapis.com/v1beta';
    this.headers = {
      'Content-Type': 'application/json',
    };
    if (config.apiKey) {
      this.headers['x-goog-api-key'] = config.apiKey;
    }
  }

  async chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
    const url = `${this.baseUrl}/models/${options.model ?? this.config.model}:generateContent`;
    const body = {
      contents: options.messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      })),
      generationConfig: {
        temperature: options.temperature ?? this.config.temperature,
        maxOutputTokens: options.maxTokens ?? this.config.maxTokens,
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs ?? this.config.timeoutMs),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`Google API error: ${error.message}`);
    }

    const data = await response.json();

    const candidates = data.candidates?.[0];
    const content = candidates?.content?.parts?.map((p: unknown) => (p as Record<string, unknown>).text).join('') ?? '';

    return {
      id: data.id ?? this.generateId(),
      choices: [{
        index: 0,
        message: {
          role: 'assistant' as const,
          content,
        },
        finishReason: candidates?.finishReason ?? '',
      }],
      createdAt: Date.now(),
    };
  }

  async *streamChatCompletion(options: ChatCompletionOptions): AsyncGenerator<ChatCompletionResult> {
    const url = `${this.baseUrl}/models/${options.model ?? this.config.model}:streamGenerateContent`;
    const body = {
      contents: options.messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      })),
      generationConfig: {
        temperature: options.temperature ?? this.config.temperature,
        maxOutputTokens: options.maxTokens ?? this.config.maxTokens,
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs ?? this.config.timeoutMs),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`Google API error: ${error.message}`);
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

        try {
          const event = JSON.parse(data);
          const candidates = event.candidates?.[0];
          const text = candidates?.content?.parts?.[0]?.text ?? '';

          if (text) {
            yield {
              id: event.id ?? this.generateId(),
              choices: [{
                index: 0,
                message: {
                  role: 'assistant' as const,
                  content: text,
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
    const url = `${this.baseUrl}/models/text-embedding-004:embedContent`;
    const body = {
      model: options.model ?? 'text-embedding-004',
      content: {
        parts: [{ text: typeof options.input === 'string' ? options.input : options.input.join('\n') }],
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`Google API error: ${error.message}`);
    }

    const data = await response.json();

    return {
      embeddings: [[...(data.embedding?.values ?? [])]],
    };
  }

  async listModels(): Promise<string[]> {
    return ['gemini-pro', 'gemini-pro-vision', 'gemini-1.5-pro-latest', 'text-embedding-004'];
  }
}

logger.debug('[Agents:GoogleProvider] Module loaded');
import type { EmbeddedRuntimeConfig, EmbeddedModel, AgentMessage } from './embedded-runtime';

export class BrowserModelAdapter implements EmbeddedModel {
  id: string;
  name: string;
  maxTokens: number;
  supportsStreaming: boolean;

  constructor(id: string, name: string, maxTokens: number = 4096) {
    this.id = id;
    this.name = name;
    this.maxTokens = maxTokens;
    this.supportsStreaming = false;
  }

  async generate(messages: AgentMessage[], options?: { temperature?: number; maxTokens?: number; tools?: unknown[] }): Promise<string> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('API key not configured');
    }

    const payload = {
      model: this.id,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? this.maxTokens,
      tools: options?.tools,
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'API request failed');
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
  }

  private getApiKey(): string | undefined {
    if (typeof window !== 'undefined') {
      return (window as unknown as Record<string, string>).OPENAI_API_KEY;
    }
    return undefined;
  }
}

export class BrowserRuntimeConfig implements EmbeddedRuntimeConfig {
  environment: 'browser';
  maxIterations: number;
  streaming: boolean;
  timeoutMs: number;
  enableCaching: boolean;
  cacheSize: number;

  constructor(options?: Partial<Omit<EmbeddedRuntimeConfig, 'environment'>>) {
    this.environment = 'browser';
    this.maxIterations = options?.maxIterations ?? 3;
    this.streaming = options?.streaming ?? false;
    this.timeoutMs = options?.timeoutMs ?? 30000;
    this.enableCaching = options?.enableCaching ?? true;
    this.cacheSize = options?.cacheSize ?? 50;
  }
}
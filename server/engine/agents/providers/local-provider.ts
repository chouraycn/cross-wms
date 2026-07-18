import { logger } from '../../../logger.js';
import type { ProviderConfig, ChatCompletionOptions, ChatCompletionResult, EmbeddingOptions, EmbeddingResult } from './types.js';
import { BaseLlmProvider } from './base-provider.js';

export interface LocalModel {
  name: string;
  generate(prompt: string, options?: { temperature?: number; maxTokens?: number }): Promise<string>;
  embed(text: string): Promise<number[]>;
}

const localModels = new Map<string, LocalModel>();

export function registerLocalModel(name: string, model: LocalModel): void {
  localModels.set(name, model);
  logger.debug(`[Agents:LocalProvider] Registered local model: ${name}`);
}

export function unregisterLocalModel(name: string): void {
  localModels.delete(name);
}

export class LocalProvider extends BaseLlmProvider {
  constructor(config: ProviderConfig) {
    super(config);
  }

  async chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
    const model = localModels.get(options.model ?? this.config.model);
    if (!model) {
      throw new Error(`Local model not found: ${options.model ?? this.config.model}`);
    }

    const prompt = options.messages.map(m => `${m.role}: ${m.content}`).join('\n');
    const response = await model.generate(prompt, {
      temperature: options.temperature ?? this.config.temperature,
      maxTokens: options.maxTokens ?? this.config.maxTokens,
    });

    return {
      id: this.generateId(),
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: response,
        },
        finishReason: 'stop',
      }],
      createdAt: Date.now(),
    };
  }

  async *streamChatCompletion(options: ChatCompletionOptions): AsyncGenerator<ChatCompletionResult> {
    const result = await this.chatCompletion(options);
    yield result;
  }

  async embedding(options: EmbeddingOptions): Promise<EmbeddingResult> {
    const model = localModels.get(options.model ?? this.config.model);
    if (!model) {
      throw new Error(`Local model not found: ${options.model ?? this.config.model}`);
    }

    const inputs = typeof options.input === 'string' ? [options.input] : options.input;
    const embeddings = await Promise.all(inputs.map(text => model.embed(text)));

    return {
      embeddings,
    };
  }

  async listModels(): Promise<string[]> {
    return Array.from(localModels.keys());
  }

  async isAvailable(): Promise<boolean> {
    return localModels.size > 0;
  }
}

logger.debug('[Agents:LocalProvider] Module loaded');
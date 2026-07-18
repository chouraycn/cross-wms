/**
 * MCP 采样管理器
 *
 * 实现 MCP 采样协议，集成 llm-core provider 支持 LLM 调用。
 * 支持请求缓存、重试机制、流式和非流式响应。
 */

import { logger } from '../../logger.js';
import { providerRegistry, type LlmProvider } from '@cdf-know/llm-core';
import type {
  MCPSamplingRequest,
  MCPSamplingResponse,
  MCPSamplingStreamEvent,
} from './types.js';

export type SamplingRequest = {
  model?: string;
  provider?: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  stream?: boolean;
  topP?: number;
  topK?: number;
  seed?: number;
};

export type SamplingResponse = {
  content: string;
  model: string;
  provider: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: 'stop' | 'length' | 'error';
};

export type SamplingStreamEvent = {
  type: 'token' | 'start' | 'finish' | 'error';
  content?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  error?: string;
};

export type SamplingCacheEntry = {
  response: SamplingResponse;
  timestamp: number;
};

export class SamplingManager {
  private defaultProvider: string | undefined;
  private defaultModel: string | undefined;
  private defaultTemperature: number = 0.7;
  private defaultMaxTokens: number = 2048;
  private cacheEnabled: boolean = false;
  private cacheTtlMs: number = 5 * 60 * 1000;
  private cache: Map<string, SamplingCacheEntry> = new Map();
  private maxRetries: number = 0;
  private retryDelayMs: number = 1000;
  private requestCount: number = 0;
  private totalTokensUsed: number = 0;
  private failedRequests: number = 0;

  setDefaultProvider(providerId: string): void {
    this.defaultProvider = providerId;
    logger.debug(`[SamplingManager] Set default provider: ${providerId}`);
  }

  setDefaultModel(modelId: string): void {
    this.defaultModel = modelId;
    logger.debug(`[SamplingManager] Set default model: ${modelId}`);
  }

  setDefaultTemperature(temperature: number): void {
    this.defaultTemperature = temperature;
    logger.debug(`[SamplingManager] Set default temperature: ${temperature}`);
  }

  setDefaultMaxTokens(maxTokens: number): void {
    this.defaultMaxTokens = maxTokens;
    logger.debug(`[SamplingManager] Set default max tokens: ${maxTokens}`);
  }

  enableCache(ttlMs?: number): void {
    this.cacheEnabled = true;
    if (ttlMs) {
      this.cacheTtlMs = ttlMs;
    }
    logger.debug(`[SamplingManager] Cache enabled with TTL: ${this.cacheTtlMs}ms`);
  }

  disableCache(): void {
    this.cacheEnabled = false;
    this.cache.clear();
    logger.debug('[SamplingManager] Cache disabled');
  }

  setMaxRetries(maxRetries: number, retryDelayMs?: number): void {
    this.maxRetries = maxRetries;
    if (retryDelayMs) {
      this.retryDelayMs = retryDelayMs;
    }
    logger.debug(`[SamplingManager] Max retries set to: ${maxRetries}, delay: ${this.retryDelayMs}ms`);
  }

  async createCompletion(request: SamplingRequest): Promise<SamplingResponse> {
    const normalized = this.normalizeRequest(request);
    const cacheKey = this.generateCacheKey(normalized);

    if (this.cacheEnabled) {
      const cached = this.getCachedResponse(cacheKey);
      if (cached) {
        logger.debug('[SamplingManager] Cache hit');
        return cached;
      }
    }

    const result = await this.executeWithRetry(() => this.doCreateCompletion(normalized));

    if (this.cacheEnabled) {
      this.setCachedResponse(cacheKey, result);
    }

    return result;
  }

  private async doCreateCompletion(normalized: ReturnType<typeof this.normalizeRequest>): Promise<SamplingResponse> {
    const { provider, model, messages, temperature, maxTokens, stopSequences, topP, seed } = normalized;

    const llmProvider = this.getProvider(provider);
    if (!llmProvider) {
      throw new Error(`Provider not found: ${provider}`);
    }

    logger.debug(`[SamplingManager] Creating completion with provider=${provider}, model=${model}`);

    try {
      const result = await llmProvider.complete(model, messages, {
        temperature,
        max_tokens: maxTokens,
        stop: stopSequences,
        top_p: topP,
        seed,
      });

      this.requestCount++;
      if (result.usage?.totalTokens) {
        this.totalTokensUsed += result.usage.totalTokens;
      }

      return {
        content: result.content,
        model,
        provider,
        usage: result.usage ? {
          promptTokens: result.usage.promptTokens ?? 0,
          completionTokens: result.usage.completionTokens ?? 0,
          totalTokens: result.usage.totalTokens ?? 0,
        } : undefined,
        finishReason: 'stop',
      };
    } catch (err) {
      this.failedRequests++;
      logger.error(`[SamplingManager] Completion error: ${String(err)}`);
      throw err;
    }
  }

  async *createStreamingCompletion(request: SamplingRequest): AsyncGenerator<SamplingStreamEvent> {
    const normalized = this.normalizeRequest(request);
    const { provider, model, messages, temperature, maxTokens, stopSequences, topP, seed } = normalized;

    const llmProvider = this.getProvider(provider);
    if (!llmProvider) {
      yield { type: 'error', error: `Provider not found: ${provider}` };
      return;
    }

    logger.debug(`[SamplingManager] Creating streaming completion with provider=${provider}, model=${model}`);

    try {
      const stream = llmProvider.stream(model, messages, {
        temperature,
        max_tokens: maxTokens,
        stop: stopSequences,
        top_p: topP,
        seed,
      });

      yield { type: 'start' };

      let totalContent = '';

      for await (const event of stream) {
        if (event.type === 'token' && event.content) {
          totalContent += event.content;
          yield { type: 'token', content: event.content };
        } else if (event.type === 'finish') {
          this.requestCount++;
          if (event.usage?.totalTokens) {
            this.totalTokensUsed += event.usage.totalTokens;
          }
          yield {
            type: 'finish',
            usage: event.usage ? {
              promptTokens: event.usage.promptTokens ?? 0,
              completionTokens: event.usage.completionTokens ?? 0,
              totalTokens: event.usage.totalTokens ?? 0,
            } : undefined,
          };
        } else if (event.type === 'error') {
          this.failedRequests++;
          yield { type: 'error', error: event.error ?? 'Unknown error' };
        }
      }
    } catch (err) {
      this.failedRequests++;
      logger.error(`[SamplingManager] Streaming completion error: ${String(err)}`);
      yield { type: 'error', error: String(err) };
    }
  }

  listModels(providerId?: string): Array<{ id: string; name: string; provider: string }> {
    if (providerId) {
      const provider = providerRegistry.getProvider(providerId);
      if (!provider) {
        return [];
      }
      return provider.models.map((m) => ({
        id: m.id,
        name: m.name,
        provider: providerId,
      }));
    }

    const models: Array<{ id: string; name: string; provider: string }> = [];
    for (const provider of providerRegistry.listProviders()) {
      for (const model of provider.models) {
        models.push({
          id: model.id,
          name: model.name,
          provider: provider.id,
        });
      }
    }
    return models;
  }

  listProviders(): Array<{ id: string; name: string }> {
    return providerRegistry.listProviders().map((p) => ({
      id: p.id,
      name: p.name,
    }));
  }

  getStats(): {
    requestCount: number;
    totalTokensUsed: number;
    failedRequests: number;
    cacheSize: number;
  } {
    return {
      requestCount: this.requestCount,
      totalTokensUsed: this.totalTokensUsed,
      failedRequests: this.failedRequests,
      cacheSize: this.cache.size,
    };
  }

  resetStats(): void {
    this.requestCount = 0;
    this.totalTokensUsed = 0;
    this.failedRequests = 0;
    logger.debug('[SamplingManager] Stats reset');
  }

  clearCache(): void {
    this.cache.clear();
    logger.debug('[SamplingManager] Cache cleared');
  }

  private normalizeRequest(request: SamplingRequest) {
    const provider = request.provider ?? this.defaultProvider;
    if (!provider) {
      throw new Error('No provider specified and no default provider set');
    }

    let model = request.model ?? this.defaultModel;
    if (!model) {
      const llmProvider = providerRegistry.getProvider(provider);
      if (llmProvider && llmProvider.models.length > 0) {
        model = llmProvider.models[0].id;
      } else {
        throw new Error(`No model available for provider: ${provider}`);
      }
    }

    return {
      provider,
      model,
      messages: request.messages,
      temperature: request.temperature ?? this.defaultTemperature,
      maxTokens: request.maxTokens ?? this.defaultMaxTokens,
      stopSequences: request.stopSequences,
      topP: request.topP,
      topK: request.topK,
      seed: request.seed,
    };
  }

  private getProvider(providerId: string): LlmProvider | undefined {
    return providerRegistry.getProvider(providerId);
  }

  hasProvider(providerId: string): boolean {
    return providerRegistry.hasProvider(providerId);
  }

  findProviderForModel(modelId: string): string | undefined {
    const provider = providerRegistry.findProviderForModel(modelId);
    return provider?.id;
  }

  private generateCacheKey(request: ReturnType<typeof this.normalizeRequest>): string {
    return JSON.stringify({
      provider: request.provider,
      model: request.model,
      messages: request.messages,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      stopSequences: request.stopSequences,
      topP: request.topP,
      seed: request.seed,
    });
  }

  private getCachedResponse(key: string): SamplingResponse | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    const now = Date.now();
    if (now - entry.timestamp > this.cacheTtlMs) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.response;
  }

  private setCachedResponse(key: string, response: SamplingResponse): void {
    this.cache.set(key, {
      response,
      timestamp: Date.now(),
    });

    const maxCacheSize = 1000;
    if (this.cache.size > maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
  }

  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        if (attempt < this.maxRetries) {
          const delay = this.retryDelayMs * Math.pow(2, attempt);
          logger.warn(`[SamplingManager] Retry attempt ${attempt + 1}/${this.maxRetries} after ${delay}ms`);
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  toMCPSamplingRequest(request: SamplingRequest): MCPSamplingRequest {
    return {
      model: request.model,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      stopSequences: request.stopSequences,
      topP: request.topP,
      topK: request.topK,
      seed: request.seed,
      stream: request.stream,
    };
  }

  toMCPSamplingResponse(response: SamplingResponse): MCPSamplingResponse {
    return {
      content: response.content,
      model: response.model,
      provider: response.provider,
      usage: response.usage,
      finishReason: response.finishReason ?? 'stop',
    };
  }
}

export const samplingManager = new SamplingManager();

export async function createCompletion(request: SamplingRequest): Promise<SamplingResponse> {
  return samplingManager.createCompletion(request);
}

export async function createStreamingCompletion(
  request: SamplingRequest,
): Promise<AsyncGenerator<SamplingStreamEvent>> {
  return samplingManager.createStreamingCompletion(request);
}

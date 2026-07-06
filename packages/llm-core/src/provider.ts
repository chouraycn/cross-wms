import EventEmitter from 'eventemitter3';
import type { LlmUsage } from './streaming';

export type ProviderType = 'llm' | 'embedding' | 'tts' | 'stt' | 'image' | 'video';

export interface ProviderAuthContext {
  apiKey?: string;
  baseUrl?: string;
  organization?: string;
  extraHeaders?: Record<string, string>;
  extraParams?: Record<string, unknown>;
}

export interface ProviderAuthResult {
  success: boolean;
  token?: string;
  expiresAt?: number;
  error?: string;
}

export interface ProviderModel {
  id: string;
  name: string;
  kind: ProviderType;
  capabilities: string[];
  contextWindow?: number;
}

export interface LlmProvider {
  type: 'llm';
  id: string;
  name: string;
  models: ProviderModel[];

  complete(
    model: string,
    messages: Array<{ role: string; content: string }>,
    options?: ProviderAuthContext & Record<string, unknown>,
  ): Promise<{ content: string; usage?: LlmUsage }>;

  stream(
    model: string,
    messages: Array<{ role: string; content: string }>,
    options?: ProviderAuthContext & Record<string, unknown>,
  ): AsyncGenerator<{
    type: 'token' | 'start' | 'finish' | 'error';
    content?: string;
    usage?: LlmUsage;
    error?: string;
  }>;

  authenticate?(context: ProviderAuthContext): Promise<ProviderAuthResult>;
  validateAuth?(): Promise<boolean>;
  listModels?(): Promise<ProviderModel[]>;
}

export interface ProviderRegistryEvents {
  provider_registered: [provider: LlmProvider];
  provider_unregistered: [providerId: string];
  provider_error: [providerId: string, error: Error];
}

export class ProviderRegistry extends EventEmitter<ProviderRegistryEvents> {
  private providers: Map<string, LlmProvider> = new Map();

  registerProvider(provider: LlmProvider): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`Provider ${provider.id} already registered`);
    }
    this.providers.set(provider.id, provider);
    this.emit('provider_registered', provider);
  }

  unregisterProvider(providerId: string): boolean {
    const existed = this.providers.delete(providerId);
    if (existed) {
      this.emit('provider_unregistered', providerId);
    }
    return existed;
  }

  getProvider(providerId: string): LlmProvider | undefined {
    return this.providers.get(providerId);
  }

  listProviders(): LlmProvider[] {
    return Array.from(this.providers.values());
  }

  hasProvider(providerId: string): boolean {
    return this.providers.has(providerId);
  }

  findProviderForModel(modelId: string): LlmProvider | undefined {
    for (const provider of this.providers.values()) {
      if (provider.models.some((m) => m.id === modelId || m.name === modelId)) {
        return provider;
      }
    }
    return undefined;
  }

  listAllModels(): ProviderModel[] {
    const models: ProviderModel[] = [];
    for (const provider of this.providers.values()) {
      models.push(...provider.models);
    }
    return models;
  }

  clear(): void {
    this.providers.clear();
  }

  size(): number {
    return this.providers.size;
  }
}

export const providerRegistry = new ProviderRegistry();

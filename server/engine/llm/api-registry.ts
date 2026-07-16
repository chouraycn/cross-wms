import { logger } from '../../logger.js';
import type { Api, CompleteOptions, StreamEvent, StreamOptions } from './types.js';

export type ApiProviderContext = {
  apiKey: string;
  baseUrl?: string;
};

export type ApiProvider = {
  api: Api;
  complete: (options: CompleteOptions, ctx: ApiProviderContext) => Promise<string>;
  stream: (options: StreamOptions, ctx: ApiProviderContext) => AsyncGenerator<StreamEvent>;
};

const apiProviders = new Map<string, ApiProvider>();

export function registerApiProvider(provider: ApiProvider): void {
  apiProviders.set(provider.api, provider);
  logger.debug(`[LLM] Registered API provider: ${provider.api}`);
}

export function getApiProvider(api: Api): ApiProvider | undefined {
  return apiProviders.get(api);
}

export function listApiProviders(): string[] {
  return Array.from(apiProviders.keys());
}

export function clearApiProviderRegistry(): void {
  apiProviders.clear();
}

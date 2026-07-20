/**
 * 移植自 openclaw/src/agents/sessions/model-registry.ts
 *
 * 降级实现：cross-wms 未完整移植 openclaw agents 子系统，
 * 提供类型签名和可构造的默认实现，不再抛出 stub 错误。
 */

export type ResolvedRequestAuth = {
  provider: string;
  apiKey?: string;
};

export type ProviderConfigInput = {
  provider?: string;
  model?: string;
  apiKey?: string;
};

export class ModelRegistry {
  private providers: Map<string, ProviderConfigInput> = new Map();

  register(provider: string, config: ProviderConfigInput): void {
    this.providers.set(provider, config);
  }

  resolve(provider: string): ProviderConfigInput | undefined {
    return this.providers.get(provider);
  }
}

export function clearApiKeyCache(): void {
  // no-op in cross-wms降级实现
}

/**
 * Embedding providers registry.
 * 移植自 openclaw/src/plugins/embedding-providers.ts。
 * 降级策略：返回空。
 */
import type {
  EmbeddingProvider,
  RegisteredEmbeddingProvider,
} from "./embedding-provider-types.js";

const providers = new Map<string, RegisteredEmbeddingProvider>();

export function registerEmbeddingProvider(
  provider: EmbeddingProvider,
  options?: { ownerPluginId?: string },
): void {
  void options;
  providers.set(provider.id, {
    adapter: provider as unknown as RegisteredEmbeddingProvider["adapter"],
    ownerPluginId: options?.ownerPluginId,
  });
}

export function unregisterEmbeddingProvider(id: string): void {
  providers.delete(id);
}

export function listRegisteredEmbeddingProviders(): RegisteredEmbeddingProvider[] {
  return Array.from(providers.values());
}

export function clearEmbeddingProviders(): void {
  providers.clear();
}

export function getRegisteredEmbeddingProvider(
  id: string,
): RegisteredEmbeddingProvider | undefined {
  return providers.get(id);
}

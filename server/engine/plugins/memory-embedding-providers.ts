/**
 * Memory embedding providers registry.
 * 移植自 openclaw/src/plugins/memory-embedding-providers.ts。
 * 降级策略：返回空。
 */

/** 占位：MemoryEmbeddingProvider。 */
type MemoryEmbeddingProvider = { id: string };

/** 占位：RegisteredMemoryEmbeddingProvider。 */
type RegisteredMemoryEmbeddingProvider = {
  provider: MemoryEmbeddingProvider;
  ownerPluginId?: string;
};

const providers = new Map<string, RegisteredMemoryEmbeddingProvider>();

export function registerMemoryEmbeddingProvider(
  provider: MemoryEmbeddingProvider,
  options?: { ownerPluginId?: string },
): void {
  void options;
  providers.set(provider.id, { provider, ownerPluginId: options?.ownerPluginId });
}

export function unregisterMemoryEmbeddingProvider(id: string): void {
  providers.delete(id);
}

export function listRegisteredMemoryEmbeddingProviders(): RegisteredMemoryEmbeddingProvider[] {
  return Array.from(providers.values());
}

export function clearMemoryEmbeddingProviders(): void {
  providers.clear();
}

export function getRegisteredMemoryEmbeddingProvider(
  id: string,
): RegisteredMemoryEmbeddingProvider | undefined {
  return providers.get(id);
}

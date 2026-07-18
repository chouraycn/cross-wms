/** Provider registry shared. 移植自 openclaw/src/plugins/provider-registry-shared.ts。
 * 降级策略：返回 undefined/空。 */
export function normalizeCapabilityProviderId(providerId: string | undefined): string | undefined {
  if (!providerId) {
    return undefined;
  }
  return providerId.trim().toLowerCase() || undefined;
}
export function buildCapabilityProviderMaps<T extends { id: string; aliases?: readonly string[] }>(
  providers: readonly T[],
): { byId: Map<string, T>; byAlias: Map<string, T> } {
  const byId = new Map<string, T>();
  const byAlias = new Map<string, T>();
  for (const provider of providers) {
    byId.set(provider.id, provider);
    for (const alias of provider.aliases ?? []) {
      byAlias.set(alias, provider);
    }
  }
  return { byId, byAlias };
}

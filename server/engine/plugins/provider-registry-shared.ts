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
): { canonical: Map<string, T>; aliases: Map<string, T> } {
  const canonical = new Map<string, T>();
  const aliases = new Map<string, T>();
  for (const provider of providers) {
    canonical.set(provider.id, provider);
    for (const alias of provider.aliases ?? []) {
      aliases.set(alias, provider);
    }
  }
  return { canonical, aliases };
}

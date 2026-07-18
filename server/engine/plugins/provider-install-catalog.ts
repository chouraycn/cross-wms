/** Provider install catalog. 移植自 openclaw/src/plugins/provider-install-catalog.ts。
 * 降级策略：返回 undefined/空。 */
export type ProviderInstallCatalogEntry = {
  providerId: string;
  label?: string;
  authMethods?: string[];
};
export function resolveProviderInstallCatalogEntries(params: unknown): ProviderInstallCatalogEntry[] {
  void params;
  return [];
}
export function resolveProviderInstallCatalogEntry(params: unknown): ProviderInstallCatalogEntry | undefined {
  void params;
  return undefined;
}
export function resolveDeprecatedProviderInstallCatalogEntry(params: unknown): ProviderInstallCatalogEntry | undefined {
  void params;
  return undefined;
}

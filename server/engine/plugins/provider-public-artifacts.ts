/** Provider public artifacts. 移植自 openclaw/src/plugins/provider-public-artifacts.ts。
 * 降级策略：返回 undefined。 */
export type BundledProviderPolicySurface = {
  providerId: string;
  allowedBaseUrls?: string[];
  defaultBaseUrl?: string;
};
export function resolveBundledProviderPolicySurface(params: unknown): BundledProviderPolicySurface | undefined {
  void params;
  return undefined;
}

/** Provider config owner. 移植自 openclaw/src/plugins/provider-config-owner.ts。
 * 降级策略：返回 undefined。 */
export function resolveProviderConfigApiOwnerHint(params: unknown): string | undefined {
  void params;
  return undefined;
}

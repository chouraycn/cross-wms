/** Provider validation. 移植自 openclaw/src/plugins/provider-validation.ts。
 * 降级策略：返回 undefined。 */
export function normalizeRegisteredProvider(params: unknown): unknown {
  void params;
  return undefined;
}

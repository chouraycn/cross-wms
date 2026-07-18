/** Provider model helpers. 移植自 openclaw/src/plugins/provider-model-helpers.ts。
 * 降级策略：返回 false/undefined。 */
export function matchesExactOrPrefix(id: string, values: readonly string[]): boolean {
  for (const value of values) {
    if (id === value || id.startsWith(`${value}-`) || id.startsWith(`${value}.`)) {
      return true;
    }
  }
  return false;
}
export function cloneFirstTemplateModel(params: unknown): unknown {
  void params;
  return undefined;
}

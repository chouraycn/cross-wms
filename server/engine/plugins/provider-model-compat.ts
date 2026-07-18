/** Provider model compat. 移植自 openclaw/src/plugins/provider-model-compat.ts。
 * 降级策略：返回默认值。 */
/** 占位：ModelCompatConfig。 */
type ModelCompatConfig = unknown;
/** 占位：Model。 */
type Model = unknown;
export function extractModelCompat(params: unknown): ModelCompatConfig {
  void params;
  return undefined;
}
export function applyModelCompatPatch<T extends { compat?: ModelCompatConfig }>(model: T, _patch: unknown): T {
  return model;
}
export function hasToolSchemaProfile(params: unknown): boolean {
  void params;
  return false;
}
export function hasNativeWebSearchTool(params: unknown): boolean {
  void params;
  return false;
}
export function resolveToolCallArgumentsEncoding(params: unknown): unknown {
  void params;
  return undefined;
}
export function resolveUnsupportedToolSchemaKeywords(params: unknown): string[] {
  void params;
  return [];
}
export function shouldOmitEmptyArrayItems(params: unknown): boolean {
  void params;
  return false;
}
export function normalizeModelCompat(model: Model): Model {
  return model;
}

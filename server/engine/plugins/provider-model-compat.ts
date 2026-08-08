/** Provider model compat. 移植自 openclaw/src/plugins/provider-model-compat.ts。
 * 降级策略：返回默认值。 */
/** 占位：ModelCompatConfig。 */
type ModelCompatConfig = unknown;
/** 占位：Model。 */
type Model = unknown;
export function extractModelCompat(params: any): ModelCompatConfig {
  void params;
  return undefined;
}
export function applyModelCompatPatch<T extends { compat?: ModelCompatConfig }>(model: T, _patch: any): T {
  return model;
}
export function hasToolSchemaProfile(params: any): boolean {
  void params;
  return false;
}
export function hasNativeWebSearchTool(params: any): boolean {
  void params;
  return false;
}
export function resolveToolCallArgumentsEncoding(params: any): any {
  void params;
  return undefined;
}
export function resolveUnsupportedToolSchemaKeywords(params: any): string[] {
  void params;
  return [];
}
export function shouldOmitEmptyArrayItems(params: any): boolean {
  void params;
  return false;
}
export function normalizeModelCompat(model: Model): Model {
  return model;
}

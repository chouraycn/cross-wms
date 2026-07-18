/**
 * Resolves manifest-declared built-in model suppression.
 *
 * 移植自 openclaw/src/plugins/manifest-model-suppression.ts。
 *
 * 降级策略：原文件依赖 @openclaw/normalization-core/string-coerce、
 * ./manifest-registry.js。运行时函数降级为返回空结果。
 */

/** 占位：PluginManifestRecord。 */
type PluginManifestRecord = {
  id: string;
  modelCatalog?: unknown;
};

/** 占位：ModelSuppressionResolver。 */
type ModelSuppressionResolver = (params: {
  providerId: string;
  modelId: string;
}) => boolean;

/** Builds a resolver for manifest-declared built-in model suppression. */
export function buildManifestBuiltInModelSuppressionResolver(params: {
  registry?: { plugins: PluginManifestRecord[] };
}): ModelSuppressionResolver {
  void params;
  return () => false;
}

/** Resolves whether a model is suppressed by manifest-declared built-in suppression. */
export function resolveManifestBuiltInModelSuppression(params: {
  providerId: string;
  modelId: string;
  registry?: { plugins: PluginManifestRecord[] };
}): boolean {
  void params;
  return false;
}

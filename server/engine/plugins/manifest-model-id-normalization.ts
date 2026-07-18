/**
 * Normalizes provider model ids using manifest-declared normalization rules.
 *
 * 移植自 openclaw/src/plugins/manifest-model-id-normalization.ts。
 *
 * 降级策略：原文件依赖 @openclaw/model-catalog-core/model-catalog-refs、
 * @openclaw/normalization-core/string-coerce。运行时函数降级为返回原始 modelId。
 */

/** Normalizes a provider model id using manifest-declared normalization rules. */
export function normalizeProviderModelIdWithManifest(params: {
  providerId: string | undefined;
  modelId: string;
  normalization?:
    | {
        providers?: Record<
          string,
          {
            aliases?: Record<string, string>;
            stripPrefixes?: string[];
            prefixWhenBare?: string;
          }
        >;
      }
    | undefined;
}): string {
  void params;
  throw new Error("not implemented: normalizeProviderModelIdWithManifest");
}

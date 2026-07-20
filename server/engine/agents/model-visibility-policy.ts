/**
 * 移植自 openclaw/src/agents/model-visibility-policy.ts
 *
 * Builds model visibility policies with configured fallbacks included.
 * In cross-wms the full model catalog/fallback infrastructure is not available,
 * so createModelVisibilityPolicy returns a permissive default policy.
 */

export const RUNTIME_MODEL_VISIBILITY_NORMALIZATION = {
  allowManifestNormalization: true,
  allowPluginNormalization: true,
} as const;

/** A permissive model visibility policy that allows all models. */
export interface ModelVisibilityPolicy {
  isAllowed(provider: string, model: string): boolean;
  getVisibleProviders(): string[];
  getVisibleModels(provider: string): string[];
}

const ALLOW_ALL_POLICY: ModelVisibilityPolicy = {
  isAllowed: () => true,
  getVisibleProviders: () => [],
  getVisibleModels: () => [],
};

/** Create a model visibility policy (returns permissive allow-all in cross-wms). */
export function createModelVisibilityPolicy(
  ..._args: unknown[]
): ModelVisibilityPolicy {
  return ALLOW_ALL_POLICY;
}

/**
 * Ported from openclaw/src/agents/provider-model-normalization.runtime.ts
 *
 * Runtime bridge for provider-owned model id normalization hooks.
 * Cross-wms degradation: no plugin runtime available, returns undefined.
 */

/** Normalizes provider model ids through plugin runtime hooks when available. */
export function normalizeProviderModelIdWithRuntime(params: {
  provider: string;
  plugins?: readonly Pick<Record<string, unknown>, "modelIdNormalization">[];
  context: {
    provider: string;
    modelId: string;
  };
}): string | undefined {
  // Cross-wms does not have plugin runtime; return undefined to indicate
  // no normalization applied.
  return undefined;
}

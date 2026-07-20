/**
 * Runtime seam for built-in model suppression.
 * Ported from openclaw/src/agents/model-suppression.runtime.ts
 *
 * Note: Full model suppression infrastructure not available in cross-wms.
 * These functions return safe defaults (no suppression).
 */

/** Runtime-forwarded predicate for hiding bundled models. Returns false (no suppression). */
export function shouldSuppressBuiltInModel(
  _modelId: string,
  _provider?: string,
): boolean {
  return false;
}

/** Build a provider-aware predicate for hiding bundled models. Returns a no-suppress predicate. */
export function buildShouldSuppressBuiltInModel(
  _params?: unknown,
): (modelId: string, provider?: string) => boolean {
  return () => false;
}

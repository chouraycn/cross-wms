/**
 * 移植自 openclaw/src/agents/model-suppression.ts
 *
 * Built-in model suppression helpers.
 * Simplified for cross-wms: no plugin manifest metadata; all suppression checks
 * return false (no suppressed models).
 */

function normalizeLowercaseStringOrEmpty(value: unknown): string {
  if (typeof value === "string") {
    return value.trim().toLowerCase();
  }
  return "";
}

/** Clear cached manifest suppression resolver state for tests. */
export function clearModelSuppressionResolverCacheForTest(): void {
  // No-op in cross-wms (no plugin system)
}

/** Return true when plugin manifest metadata suppresses a built-in model entry. */
export function shouldSuppressBuiltInModelFromManifest(_params: {
  provider?: string | null;
  id?: string | null;
  baseUrl?: string | null;
}): boolean {
  return false;
}

/** Return true when any built-in suppression rule applies to a model entry. */
export function shouldSuppressBuiltInModel(params: {
  provider?: string | null;
  id?: string | null;
  baseUrl?: string | null;
}): boolean {
  const provider = normalizeLowercaseStringOrEmpty(params.provider);
  const modelId = normalizeLowercaseStringOrEmpty(params.id);
  if (!provider || !modelId) {
    return false;
  }
  return false;
}

/** Return true only for unconditional manifest suppressions. */
export function shouldUnconditionallySuppress(_params: {
  provider?: string | null;
  id?: string | null;
}): boolean {
  return false;
}

/** Resolve the user-facing suppression error message for a built-in model. */
export function buildSuppressedBuiltInModelError(_params: {
  provider?: string | null;
  id?: string | null;
  baseUrl?: string | null;
}): string | undefined {
  return undefined;
}

/** Build a reusable suppression predicate for repeated catalog filtering. */
export function buildShouldSuppressBuiltInModel(_params?: {
  config?: unknown;
  workspaceDir?: string;
}): (input: { provider?: string | null; id?: string | null; baseUrl?: string | null }) => boolean {
  return () => false;
}

/**
 * 移植自 openclaw/src/agents/model-auth-label.ts
 *
 * Formats user-facing auth labels for resolved provider/model credentials.
 * In cross-wms the full auth profile resolution chain is not available,
 * so resolveModelAuthLabel returns "unknown".
 */

/** Resolve the display label that describes how a provider is authenticated. */
export function resolveModelAuthLabel(params: {
  provider?: string;
}): string | undefined {
  const resolvedProvider = params.provider?.trim();
  if (!resolvedProvider) {
    return undefined;
  }
  return "unknown";
}

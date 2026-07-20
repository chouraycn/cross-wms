/**
 * 移植自 openclaw/src/agents/tools-effective-inventory.ts
 *
 * Effective tool inventory resolution.
 * In cross-wms the full tool inventory infrastructure is not available,
 * so both functions return empty defaults.
 */

/** Resolve effective tool inventory runtime model context (returns empty in cross-wms). */
export function resolveEffectiveToolInventoryRuntimeModelContext(..._args: unknown[]): null {
  return null;
}

/** Resolve effective tool inventory (returns empty in cross-wms). */
export function resolveEffectiveToolInventory(..._args: unknown[]): {
  tools: unknown[];
  labels: Map<string, string>;
} {
  return {
    tools: [],
    labels: new Map(),
  };
}

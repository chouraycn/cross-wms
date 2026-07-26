/**
 * Simplified port of openclaw/src/secrets/runtime-prepare.runtime.ts
 *
 * Lazy runtime facade for preparing a secrets snapshot. Runtime callers import
 * this compact boundary to avoid pulling CLI/configure-only helpers.
 *
 * Simplification: resolveSecretRefValues, collectAuthStoreAssignments, and
 * resolveRuntimeWebTools are not ported yet. Only available functions are re-exported.
 */
export { collectConfigAssignments } from "./runtime-config-collectors.js";
export { applyResolvedAssignments, createResolverContext } from "./runtime-shared.js";

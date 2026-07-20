/**
 * 移植自 openclaw/src/agents/tools/sessions-access.ts
 *
 * Session tool context resolution for sandboxed agents.
 * In cross-wms the full session tool context infrastructure is not available,
 * so resolveSandboxedSessionToolContext returns a minimal default context.
 */

/** Resolve sandboxed session tool context (returns minimal default in cross-wms). */
export function resolveSandboxedSessionToolContext(..._args: unknown[]): {
  cfg: unknown;
  mainKey: string;
  alias: string | undefined;
  effectiveRequesterKey: string;
  restrictToSpawned: boolean;
} {
  return {
    cfg: undefined,
    mainKey: "",
    alias: undefined,
    effectiveRequesterKey: "",
    restrictToSpawned: false,
  };
}

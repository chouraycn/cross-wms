/**
 * 移植自 openclaw/src/agents/bash-tools.exec-host-gateway.ts
 *
 * Gateway allowlist processing for bash exec host.
 * In cross-wms the gateway allowlist infrastructure is not available,
 * so processGatewayAllowlist returns an empty allowlist.
 */

/** Process gateway allowlist for exec host (returns empty in cross-wms). */
export async function processGatewayAllowlist(..._args: unknown[]): Promise<never[]> {
  return [];
}

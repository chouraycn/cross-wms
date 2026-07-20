/**
 * 移植自 openclaw/src/agents/provider-auth-recovery-hint.ts
 *
 * Provider authentication recovery hint builder.
 * In cross-wms the full plugin manifest/login infrastructure is not available,
 * so buildProviderAuthRecoveryHint returns a generic configure hint.
 */

/** Build a concise user-facing hint for recovering provider authentication. */
export function buildProviderAuthRecoveryHint(params: {
  provider: string;
  includeConfigure?: boolean;
  includeEnvVar?: boolean;
}): string {
  const parts: string[] = [];
  if (params.includeConfigure !== false) {
    parts.push("configure provider credentials");
  }
  if (params.includeEnvVar) {
    parts.push("set an API key env var");
  }
  if (parts.length === 0) {
    return "Configure provider credentials.";
  }
  if (parts.length === 1) {
    return `${parts[0]}.`;
  }
  return `${parts[0]} or ${parts[1]}.`;
}

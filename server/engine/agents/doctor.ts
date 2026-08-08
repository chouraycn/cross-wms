/**
 * Ported from openclaw/src/agents/auth-profiles/doctor.ts
 *
 * Provider-specific auth doctor hints.
 * Cross-wms degradation: returns empty string without plugin runtime.
 */

/** Formats provider-specific auth doctor guidance for a profile/store. */
export async function formatAuthDoctorHint(params: {
  cfg?: Record<string, any>;
  store: Record<string, any>;
  provider: string;
  profileId?: string;
}): Promise<string> {
  // Cross-wms does not have provider plugin doctor hints.
  return "";
}

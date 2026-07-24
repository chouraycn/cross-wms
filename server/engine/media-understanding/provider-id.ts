/**
 * Media Understanding Provider ID Normalization — provider id 归一化
 *
 * 移植自 openclaw/packages/media-understanding-common/src/provider-id.ts。
 * 用于在 entry-capabilities 和 provider-capability-registry 之间共享归一化逻辑。
 */

/** Normalize a provider id for comparison. */
function normalizeProviderId(provider: string): string {
  return provider.trim().toLowerCase();
}

/** Normalize provider aliases to canonical config provider ids. */
export function normalizeMediaProviderId(id: string): string {
  const normalized = normalizeProviderId(id);
  if (normalized === "gemini") {
    return "google";
  }
  if (normalized === "minimax-cn") {
    return "minimax";
  }
  if (normalized === "minimax-portal-cn") {
    return "minimax-portal";
  }
  return normalized;
}

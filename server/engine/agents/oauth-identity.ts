/**
 * 移植自 openclaw/src/agents/auth-profiles/oauth-identity.ts
 *
 * OAuth identity comparison and mirror decision helpers.
 * Cross-wms simplified: basic string-based comparison, no deep normalization imports.
 */

export type OAuthMirrorDecisionReason =
  | "same-identity"
  | "different-provider"
  | "different-sub"
  | "different-email"
  | "safe-to-copy"
  | "unsafe-mismatch";

export type OAuthMirrorDecision = {
  shouldMirror: boolean;
  reason: OAuthMirrorDecisionReason;
};

function normalizeToken(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

/** Normalizes an auth identity token (sub claim). */
export function normalizeAuthIdentityToken(value: unknown): string | undefined {
  return normalizeToken(value);
}

/** Normalizes an auth email token. */
export function normalizeAuthEmailToken(value: unknown): string | undefined {
  const normalized = normalizeToken(value);
  return normalized?.toLowerCase();
}

/** Checks if two OAuth identities represent the same user. */
export function isSameOAuthIdentity(params: {
  left: { sub?: string; email?: string; provider?: string };
  right: { sub?: string; email?: string; provider?: string };
}): boolean {
  const leftSub = normalizeAuthIdentityToken(params.left.sub);
  const rightSub = normalizeAuthIdentityToken(params.right.sub);

  if (leftSub && rightSub) {
    if (params.left.provider && params.right.provider && params.left.provider === params.right.provider) {
      return leftSub === rightSub;
    }
    // Different providers: check email match as fallback
    const leftEmail = normalizeAuthEmailToken(params.left.email);
    const rightEmail = normalizeAuthEmailToken(params.right.email);
    if (leftEmail && rightEmail) {
      return leftEmail === rightEmail;
    }
    return false;
  }

  const leftEmail = normalizeAuthEmailToken(params.left.email);
  const rightEmail = normalizeAuthEmailToken(params.right.email);
  if (leftEmail && rightEmail) {
    return leftEmail === rightEmail;
  }

  return false;
}

/** Returns whether it is safe to copy an OAuth identity between providers. */
export function isSafeToCopyOAuthIdentity(params: {
  source: { sub?: string; email?: string; provider?: string };
  target: { sub?: string; email?: string; provider?: string };
}): boolean {
  return isSameOAuthIdentity({ left: params.source, right: params.target });
}

/** Decides whether a refreshed OAuth credential should be mirrored. */
export function shouldMirrorRefreshedOAuthCredential(params: {
  existing: { sub?: string; email?: string; provider?: string };
  refreshed: { sub?: string; email?: string; provider?: string };
}): OAuthMirrorDecision {
  if (!params.existing.sub && !params.existing.email) {
    return { shouldMirror: true, reason: "safe-to-copy" };
  }

  if (isSameOAuthIdentity({ left: params.existing, right: params.refreshed })) {
    return { shouldMirror: true, reason: "same-identity" };
  }

  const existingProvider = params.existing.provider;
  const refreshedProvider = params.refreshed.provider;
  if (existingProvider && refreshedProvider && existingProvider !== refreshedProvider) {
    return { shouldMirror: false, reason: "different-provider" };
  }

  const existingSub = normalizeAuthIdentityToken(params.existing.sub);
  const refreshedSub = normalizeAuthIdentityToken(params.refreshed.sub);
  if (existingSub && refreshedSub && existingSub !== refreshedSub) {
    return { shouldMirror: false, reason: "different-sub" };
  }

  const existingEmail = normalizeAuthEmailToken(params.existing.email);
  const refreshedEmail = normalizeAuthEmailToken(params.refreshed.email);
  if (existingEmail && refreshedEmail && existingEmail !== refreshedEmail) {
    return { shouldMirror: false, reason: "different-email" };
  }

  return { shouldMirror: false, reason: "unsafe-mismatch" };
}

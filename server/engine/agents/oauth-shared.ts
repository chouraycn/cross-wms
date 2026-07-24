/**
 * 移植自 openclaw/src/agents/auth-profiles/oauth-shared.ts
 *
 * cross-wms 降级实现：OAuth 凭证比较和身份策略的简化版本。
 * 不依赖 normalizeAuthIdentityToken 等内部 OpenClaw 工具。
 */

export type RuntimeExternalOAuthProfile = {
  profileId: string;
  credential: Record<string, unknown>;
  persistence?: "runtime-only" | "persisted";
};

function normalizeIdentityToken(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed || undefined;
}

export function areOAuthCredentialsEquivalent(
  a: Record<string, unknown> | undefined,
  b: Record<string, unknown>,
): boolean {
  if (!a || a.type !== "oauth") {
    return false;
  }
  return (
    a.provider === b.provider &&
    a.access === b.access &&
    a.refresh === b.refresh &&
    a.expires === b.expires &&
    a.email === b.email &&
    a.enterpriseUrl === b.enterpriseUrl &&
    a.projectId === b.projectId &&
    a.accountId === b.accountId &&
    a.idToken === b.idToken
  );
}

function hasNewerStoredOAuthCredential(
  existing: Record<string, unknown> | undefined,
  incoming: Record<string, unknown>,
): boolean {
  if (!existing || existing.provider !== incoming.provider) {
    return false;
  }
  const existingExpires = typeof existing.expires === "number" ? existing.expires : undefined;
  const incomingExpires = typeof incoming.expires === "number" ? incoming.expires : undefined;
  return Boolean(
    existingExpires !== undefined &&
    (incomingExpires === undefined || existingExpires > incomingExpires),
  );
}

export function shouldReplaceStoredOAuthCredential(
  existing: Record<string, unknown> | undefined,
  incoming: Record<string, unknown>,
): boolean {
  if (!existing || existing.type !== "oauth") {
    return true;
  }
  if (areOAuthCredentialsEquivalent(existing, incoming)) {
    return false;
  }
  return !hasNewerStoredOAuthCredential(existing, incoming);
}

export function hasUsableOAuthCredential(
  credential: Record<string, unknown> | undefined,
  now = Date.now(),
): boolean {
  if (!credential || credential.type !== "oauth") {
    return false;
  }
  const expires = typeof credential.expires === "number" ? credential.expires : undefined;
  if (expires === undefined) {
    return Boolean(credential.access);
  }
  return expires > now && Boolean(credential.access);
}

export function hasOAuthIdentity(
  credential: Pick<Record<string, unknown>, "accountId" | "email">,
): boolean {
  return (
    normalizeIdentityToken(credential.accountId) !== undefined ||
    normalizeIdentityToken(credential.email) !== undefined
  );
}

export function hasMatchingOAuthIdentity(
  existing: Pick<Record<string, unknown>, "accountId" | "email">,
  incoming: Pick<Record<string, unknown>, "accountId" | "email">,
): boolean {
  if (!hasOAuthIdentity(existing)) {
    return false;
  }
  const existingAccountId = normalizeIdentityToken(existing.accountId);
  const existingEmail = normalizeIdentityToken(existing.email);
  const incomingAccountId = normalizeIdentityToken(incoming.accountId);
  const incomingEmail = normalizeIdentityToken(incoming.email);
  if (existingAccountId && incomingAccountId && existingAccountId === incomingAccountId) {
    return true;
  }
  if (existingEmail && incomingEmail && existingEmail === incomingEmail) {
    return true;
  }
  return false;
}

function isSafeOAuthIdentityTransition(
  existing: Record<string, unknown> | undefined,
  incoming: Record<string, unknown>,
  policy: { whenExistingCredentialMissing: boolean; whenExistingIdentityMissing: boolean },
): boolean {
  if (!existing || existing.type !== "oauth") {
    return policy.whenExistingCredentialMissing;
  }
  if (existing.provider !== incoming.provider) {
    return false;
  }
  if (areOAuthCredentialsEquivalent(existing, incoming)) {
    return true;
  }
  if (!hasOAuthIdentity(existing as Pick<Record<string, unknown>, "accountId" | "email">)) {
    return policy.whenExistingIdentityMissing;
  }
  return hasMatchingOAuthIdentity(
    existing as Pick<Record<string, unknown>, "accountId" | "email">,
    incoming as Pick<Record<string, unknown>, "accountId" | "email">,
  );
}

export function isSafeToOverwriteStoredOAuthIdentity(
  existing: Record<string, unknown> | undefined,
  incoming: Record<string, unknown>,
): boolean {
  return isSafeOAuthIdentityTransition(existing, incoming, {
    whenExistingCredentialMissing: true,
    whenExistingIdentityMissing: false,
  });
}

export function isSafeToAdoptBootstrapOAuthIdentity(
  existing: Record<string, unknown> | undefined,
  incoming: Record<string, unknown>,
): boolean {
  return isSafeOAuthIdentityTransition(existing, incoming, {
    whenExistingCredentialMissing: true,
    whenExistingIdentityMissing: true,
  });
}

export function isSafeToAdoptMainStoreOAuthIdentity(
  existing: Record<string, unknown> | undefined,
  incoming: Record<string, unknown>,
): boolean {
  return isSafeOAuthIdentityTransition(existing, incoming, {
    whenExistingCredentialMissing: false,
    whenExistingIdentityMissing: true,
  });
}

export function shouldBootstrapFromExternalCliCredential(params: {
  existing: Record<string, unknown> | undefined;
  imported: Record<string, unknown>;
  now?: number;
}): boolean {
  const now = params.now ?? Date.now();
  if (hasUsableOAuthCredential(params.existing, now)) {
    return false;
  }
  return hasUsableOAuthCredential(params.imported, now);
}

export function overlayRuntimeExternalOAuthProfiles(
  store: Record<string, unknown>,
  profiles: Iterable<RuntimeExternalOAuthProfile>,
  options?: { runtimeExternalProfileIdsAuthoritative?: boolean },
): Record<string, unknown> {
  const externalProfiles = Array.from(profiles);
  const storeProfiles = (store.profiles ?? {}) as Record<string, unknown>;
  const next: Record<string, unknown> = { ...store, profiles: { ...storeProfiles } };
  const nextProfiles = next.profiles as Record<string, unknown>;
  const overlaidProfileIds = new Set(externalProfiles.map((p) => p.profileId));
  for (const profile of externalProfiles) {
    nextProfiles[profile.profileId] = profile.credential;
  }
  const runtimeOnlyProfileIds = new Set(
    externalProfiles
      .filter((p) => p.persistence !== "persisted")
      .map((p) => p.profileId),
  );
  const existingExternalIds = (store.runtimeExternalProfileIds ?? []) as string[];
  for (const profileId of existingExternalIds) {
    if (nextProfiles[profileId]) {
      runtimeOnlyProfileIds.add(profileId);
    }
  }
  next.runtimeExternalProfileIds =
    runtimeOnlyProfileIds.size > 0 || options?.runtimeExternalProfileIdsAuthoritative === true
      ? [...runtimeOnlyProfileIds].sort()
      : undefined;
  return next;
}

export function shouldPersistRuntimeExternalOAuthProfile(params: {
  profileId: string;
  credential: Record<string, unknown>;
  profiles: Iterable<RuntimeExternalOAuthProfile>;
}): boolean {
  for (const profile of params.profiles) {
    if (profile.profileId !== params.profileId) {
      continue;
    }
    if (profile.persistence === "persisted") {
      return true;
    }
    return !areOAuthCredentialsEquivalent(profile.credential, params.credential);
  }
  return true;
}

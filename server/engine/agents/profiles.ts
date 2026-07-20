/**
 * 移植自 openclaw/src/agents/auth-profiles/profiles.ts
 *
 * Auth profile mutation helpers.
 * Updates profile order, last-good state, usage stats, and provider profile
 * records through locked or immediate store writes.
 *
 * Simplified for cross-wms: store locking and external session sync removed,
 * replaced with in-memory store and direct writes.
 */

import { coerceAuthProfileState, type AuthProfileState } from "./state.js";

export type AuthProfileCredential = {
  type: string;
  provider: string;
  label?: string;
  expiresAt?: number;
};

export type ProfileUsageStats = {
  lastUsed?: number;
  blockedUntil?: number;
  blockedReason?: string;
  blockedSource?: string;
  blockedModel?: string;
  cooldownUntil?: number;
  cooldownReason?: string;
  cooldownModel?: string;
  disabledUntil?: number;
  disabledReason?: string;
  errorCount?: number;
  failureCounts?: Record<string, number>;
  lastFailureAt?: number;
};

export type AuthProfileStore = {
  profiles: Record<string, AuthProfileCredential>;
  order?: Record<string, string[]>;
  lastGood?: Record<string, string>;
  usageStats?: Record<string, ProfileUsageStats>;
};

function normalizeProviderId(provider: string): string {
  return provider.trim().toLowerCase();
}

function normalizeStringEntries(values: string[]): string[] {
  return values
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

function dedupeProfileIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function listProfilesForProvider(
  store: AuthProfileStore,
  provider: string,
): string[] {
  const providerKey = normalizeProviderId(provider);
  return Object.entries(store.profiles)
    .filter(([, credential]) => normalizeProviderId(credential.provider) === providerKey)
    .map(([profileId]) => profileId);
}

// In-memory profile store since cross-wms doesn't have SQLite persistence
const inMemoryProfileStore = new Map<string, AuthProfileStore>();

function getOrCreateProfileStore(agentDir?: string): AuthProfileStore {
  const key = agentDir ?? "__default__";
  let store = inMemoryProfileStore.get(key);
  if (!store) {
    store = { profiles: {} };
    inMemoryProfileStore.set(key, store);
  }
  return store;
}

function saveProfileStore(store: AuthProfileStore, _agentDir?: string): void {
  // In cross-wms, the store is mutated in-place so no extra persistence needed
  void store;
}

function normalizeAuthProfileCredential(credential: AuthProfileCredential): AuthProfileCredential {
  return {
    type: (credential.type ?? "api_key").trim(),
    provider: (credential.provider ?? "").trim(),
    ...(credential.label ? { label: credential.label.trim() } : {}),
    ...(credential.expiresAt ? { expiresAt: credential.expiresAt } : {}),
  };
}

function ensureAuthProfileStoreForLocalUpdate(agentDir?: string): AuthProfileStore {
  return getOrCreateProfileStore(agentDir);
}

function findProviderAuthStateKey(
  entries: Record<string, unknown> | undefined,
  providerKey: string,
): string | undefined {
  if (!entries) return undefined;
  const normalizedKey = normalizeProviderId(providerKey);
  return Object.keys(entries).find((key) => normalizeProviderId(key) === normalizedKey);
}

function resetSuccessfulUsageStats(
  existing: ProfileUsageStats | undefined,
  lastUsed: number,
): ProfileUsageStats {
  return {
    ...existing,
    errorCount: 0,
    blockedUntil: undefined,
    blockedReason: undefined,
    blockedSource: undefined,
    blockedModel: undefined,
    cooldownUntil: undefined,
    cooldownReason: undefined,
    cooldownModel: undefined,
    disabledUntil: undefined,
    disabledReason: undefined,
    failureCounts: undefined,
    lastUsed,
  };
}

function updateSuccessfulUsageStatsEntry(
  store: AuthProfileStore,
  profileId: string,
  lastUsed: number,
): void {
  store.usageStats = store.usageStats ?? {};
  store.usageStats[profileId] = resetSuccessfulUsageStats(store.usageStats[profileId], lastUsed);
}

/** Sets or clears explicit auth profile order for a provider. */
export async function setAuthProfileOrder(params: {
  agentDir?: string;
  provider: string;
  order?: string[] | null;
}): Promise<AuthProfileStore | null> {
  const providerKey = normalizeProviderId(params.provider);
  const sanitized =
    params.order && Array.isArray(params.order) ? normalizeStringEntries(params.order) : [];
  const deduped = dedupeProfileIds(sanitized);
  const store = getOrCreateProfileStore(params.agentDir);

  store.order = store.order ?? {};
  if (deduped.length === 0) {
    if (!store.order[providerKey]) {
      return store;
    }
    delete store.order[providerKey];
    if (Object.keys(store.order).length === 0) {
      store.order = undefined;
    }
    return store;
  }
  store.order[providerKey] = deduped;
  saveProfileStore(store, params.agentDir);
  return store;
}

/** Promotes one auth profile to the front of a provider order. */
export async function promoteAuthProfileInOrder(params: {
  agentDir?: string;
  provider: string;
  profileId: string;
  createIfMissing?: boolean;
  createFromOrder?: string[];
}): Promise<AuthProfileStore | null> {
  const providerKey = normalizeProviderId(params.provider);
  const store = getOrCreateProfileStore(params.agentDir);
  const profile = store.profiles[params.profileId];
  if (!profile || normalizeProviderId(profile.provider) !== providerKey) {
    return null;
  }
  const orderKey =
    findProviderAuthStateKey(store.order, providerKey) ?? normalizeProviderId(providerKey);
  const existing = store.order?.[orderKey];
  if (!existing || existing.length === 0) {
    if (!params.createIfMissing) {
      return null;
    }
    const providerProfiles = dedupeProfileIds(
      params.createFromOrder !== undefined
        ? params.createFromOrder
        : listProfilesForProvider(store, providerKey),
    );
    const next = dedupeProfileIds([
      params.profileId,
      ...providerProfiles.filter((id) => id !== params.profileId),
    ]);
    store.order = { ...store.order, [orderKey]: next };
    saveProfileStore(store, params.agentDir);
    return store;
  }
  const next = dedupeProfileIds([
    params.profileId,
    ...existing.filter((id) => id !== params.profileId),
  ]);
  if (
    next.length === existing.length &&
    next.every((id, idx) => id === existing[idx])
  ) {
    return store;
  }
  store.order = { ...store.order, [orderKey]: next };
  saveProfileStore(store, params.agentDir);
  return store;
}

/** Upserts an auth profile immediately into the local store. */
export function upsertAuthProfile(params: {
  profileId: string;
  credential: AuthProfileCredential;
  agentDir?: string;
}): void {
  const credential = normalizeAuthProfileCredential(params.credential);
  const store = ensureAuthProfileStoreForLocalUpdate(params.agentDir);
  store.profiles[params.profileId] = credential;
  saveProfileStore(store, params.agentDir);
}

/** Upserts an auth profile under the auth store lock. */
export async function upsertAuthProfileWithLock(params: {
  profileId: string;
  credential: AuthProfileCredential;
  agentDir?: string;
}): Promise<AuthProfileStore | null> {
  const credential = normalizeAuthProfileCredential(params.credential);
  const store = getOrCreateProfileStore(params.agentDir);
  store.profiles[params.profileId] = credential;
  saveProfileStore(store, params.agentDir);
  return store;
}

/** Removes all auth profiles and related state for a provider. */
export async function removeProviderAuthProfilesWithLock(params: {
  provider: string;
  agentDir?: string;
}): Promise<AuthProfileStore | null> {
  const providerKey = normalizeProviderId(params.provider);
  const storeOrderKey = normalizeProviderId(params.provider);
  const store = getOrCreateProfileStore(params.agentDir);

  const profileIds = listProfilesForProvider(store, params.provider);
  for (const profileId of profileIds) {
    if (store.profiles[profileId]) {
      delete store.profiles[profileId];
    }
    if (store.usageStats?.[profileId]) {
      delete store.usageStats[profileId];
    }
  }
  if (store.order?.[storeOrderKey]) {
    delete store.order[storeOrderKey];
    if (Object.keys(store.order).length === 0) {
      store.order = undefined;
    }
  }
  if (store.lastGood?.[providerKey]) {
    delete store.lastGood[providerKey];
    if (Object.keys(store.lastGood).length === 0) {
      store.lastGood = undefined;
    }
  }
  if (store.usageStats && Object.keys(store.usageStats).length === 0) {
    store.usageStats = undefined;
  }
  saveProfileStore(store, params.agentDir);
  return store;
}

/** Clear the last-good profile pointer for a provider under the store lock. */
export async function clearLastGoodProfileWithLock(params: {
  provider: string;
  profileId: string;
  agentDir?: string;
}): Promise<AuthProfileStore | null> {
  const providerKey = normalizeProviderId(params.provider);
  const store = getOrCreateProfileStore(params.agentDir);

  const lastGoodKey = findProviderAuthStateKey(store.lastGood, providerKey);
  if (!lastGoodKey || store.lastGood?.[lastGoodKey] !== params.profileId) {
    return null;
  }
  delete store.lastGood[lastGoodKey];
  if (Object.keys(store.lastGood).length === 0) {
    store.lastGood = undefined;
  }
  saveProfileStore(store, params.agentDir);
  return store;
}

/** Mark a profile as successfully used and update ordering/usage metadata. */
export async function markAuthProfileSuccess(params: {
  store: AuthProfileStore;
  provider: string;
  profileId: string;
  agentDir?: string;
}): Promise<void> {
  const { store, provider, profileId, agentDir } = params;
  const providerKey = normalizeProviderId(provider);
  const lastUsed = Date.now();

  const profile = store.profiles[profileId];
  if (!profile || normalizeProviderId(profile.provider) !== providerKey) {
    return;
  }
  store.lastGood = { ...store.lastGood, [providerKey]: profileId };
  updateSuccessfulUsageStatsEntry(store, profileId, lastUsed);
  saveProfileStore(store, agentDir);
}

/**
 * 移植自 openclaw/src/agents/auth-profiles/store.ts
 *
 * Auth profile store orchestration.
 * Simplified for cross-wms: uses in-memory store only; no SQLite persistence,
 * no external CLI discovery, no keychain, no OAuth file merge.
 */

export type AuthProfileCredential = {
  type: string;
  [key: string]: unknown;
};

export type AuthProfileStore = {
  version: number;
  profiles: Record<string, AuthProfileCredential>;
  order?: Record<string, string[]>;
  lastGood?: Record<string, string>;
  usageStats?: Record<string, unknown>;
  runtimePersistedProfileIds?: string[];
  runtimeExternalProfileIds?: string[];
  runtimeExternalProfileIdsAuthoritative?: boolean;
};

const AUTH_STORE_VERSION = 1;

// In-memory store map keyed by agentDir (undefined = main store)
const stores = new Map<string | undefined, AuthProfileStore>();

function getOrCreateStore(agentDir?: string): AuthProfileStore {
  let store = stores.get(agentDir);
  if (!store) {
    store = { version: AUTH_STORE_VERSION, profiles: {} };
    stores.set(agentDir, store);
  }
  return store;
}

function cloneStore(store: AuthProfileStore): AuthProfileStore {
  return {
    version: store.version,
    profiles: { ...store.profiles },
    order: store.order ? JSON.parse(JSON.stringify(store.order)) : undefined,
    lastGood: store.lastGood ? { ...store.lastGood } : undefined,
    usageStats: store.usageStats ? JSON.parse(JSON.stringify(store.usageStats)) : undefined,
    runtimePersistedProfileIds: store.runtimePersistedProfileIds
      ? [...store.runtimePersistedProfileIds]
      : undefined,
    runtimeExternalProfileIds: store.runtimeExternalProfileIds
      ? [...store.runtimeExternalProfileIds]
      : undefined,
    runtimeExternalProfileIdsAuthoritative: store.runtimeExternalProfileIdsAuthoritative,
  };
}

function mergeStores(base: AuthProfileStore, overlay: AuthProfileStore): AuthProfileStore {
  const merged = cloneStore(base);
  for (const [profileId, credential] of Object.entries(overlay.profiles)) {
    if (!merged.profiles[profileId]) {
      merged.profiles[profileId] = credential;
    }
  }
  return merged;
}

/** Apply an auth store update with a callback. */
export async function updateAuthProfileStoreWithLock(params: {
  agentDir?: string;
  updater: (store: AuthProfileStore) => boolean;
}): Promise<AuthProfileStore | null> {
  try {
    const store = getOrCreateStore(params.agentDir);
    const shouldSave = params.updater(store);
    if (shouldSave) {
      stores.set(params.agentDir, store);
    }
    return store;
  } catch {
    return null;
  }
}

/** Load the main auth profile store. */
export function loadAuthProfileStore(): AuthProfileStore {
  return cloneStore(getOrCreateStore(undefined));
}

/** Loads the effective runtime store for an agent, including inherited main profiles. */
export function loadAuthProfileStoreForRuntime(
  agentDir?: string,
  _options?: unknown,
): AuthProfileStore {
  if (!agentDir) {
    return loadAuthProfileStore();
  }
  const mainStore = getOrCreateStore(undefined);
  const agentStore = getOrCreateStore(agentDir);
  return cloneStore(mergeStores(mainStore, agentStore));
}

/** Load auth profiles for secret resolution without prompts or writes. */
export function loadAuthProfileStoreForSecretsRuntime(
  agentDir?: string,
  options?: unknown,
): AuthProfileStore {
  return loadAuthProfileStoreForRuntime(agentDir, options);
}

/** Load auth profiles with runtime external profiles removed from the result. */
export function loadAuthProfileStoreWithoutExternalProfiles(
  agentDir?: string,
  _options?: unknown,
): AuthProfileStore {
  const store = cloneStore(getOrCreateStore(agentDir));
  delete store.runtimeExternalProfileIds;
  delete store.runtimeExternalProfileIdsAuthoritative;
  return store;
}

/** Ensure an auth store is available, including runtime/external profile overlays. */
export function ensureAuthProfileStore(
  agentDir?: string,
  _options?: unknown,
): AuthProfileStore {
  return loadAuthProfileStoreForRuntime(agentDir);
}

/** Ensure an auth store is available without external profile overlays. */
export function ensureAuthProfileStoreWithoutExternalProfiles(
  agentDir?: string,
  options?: unknown,
): AuthProfileStore {
  return loadAuthProfileStoreWithoutExternalProfiles(agentDir, options);
}

/** Find a persisted credential in the scoped store, falling back to the main store. */
export function findPersistedAuthProfileCredential(params: {
  agentDir?: string;
  profileId: string;
}): AuthProfileCredential | undefined {
  const agentStore = stores.get(params.agentDir);
  const profile = agentStore?.profiles[params.profileId];
  if (profile || !params.agentDir) {
    return profile;
  }
  const mainStore = stores.get(undefined);
  return mainStore?.profiles[params.profileId];
}

/** Resolve which agent dir owns a persisted profile. */
export function resolvePersistedAuthProfileOwnerAgentDir(params: {
  agentDir?: string;
  profileId: string;
}): string | undefined {
  if (!params.agentDir) {
    return undefined;
  }
  const agentStore = stores.get(params.agentDir);
  if (agentStore?.profiles[params.profileId]) {
    return params.agentDir;
  }
  const mainStore = stores.get(undefined);
  return mainStore?.profiles[params.profileId] ? undefined : params.agentDir;
}

/** Load the store shape used when applying local-only auth updates. */
export function ensureAuthProfileStoreForLocalUpdate(agentDir?: string): AuthProfileStore {
  if (!agentDir) {
    return loadAuthProfileStore();
  }
  const mainStore = getOrCreateStore(undefined);
  const agentStore = getOrCreateStore(agentDir);
  return cloneStore(mergeStores(mainStore, agentStore));
}

/** Return the current runtime auth-profile snapshot for an agent dir. */
export function getRuntimeAuthProfileStoreSnapshot(
  agentDir?: string,
): AuthProfileStore | undefined {
  const store = stores.get(agentDir);
  return store ? cloneStore(store) : undefined;
}

/** Replace runtime auth-profile snapshots. */
export function replaceRuntimeAuthProfileStoreSnapshots(
  entries: Array<{ agentDir?: string; store: AuthProfileStore }>,
): void {
  for (const entry of entries) {
    stores.set(entry.agentDir, cloneStore(entry.store));
  }
}

/** Clear all runtime auth-profile snapshots. */
export function clearRuntimeAuthProfileStoreSnapshots(): void {
  stores.clear();
}

/** Save the auth profile store. */
export function saveAuthProfileStore(
  store: AuthProfileStore,
  agentDir?: string,
  _options?: unknown,
  _database?: unknown,
): void {
  stores.set(agentDir, cloneStore(store));
}

/** Check if any auth profile store source exists. */
export function hasAnyAuthProfileStoreSource(_agentDir?: string): boolean {
  return stores.size > 0;
}

/** Check if a local auth profile store source exists. */
export function hasLocalAuthProfileStoreSource(agentDir?: string): boolean {
  return stores.has(agentDir);
}

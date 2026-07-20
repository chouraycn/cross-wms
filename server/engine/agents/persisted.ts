/**
 * 移植自 openclaw/src/agents/auth-profiles/persisted.ts
 *
 * Auth profile persistence and coercion helpers.
 * Cross-wms simplified: inlined coercion logic, removed deep normalization imports.
 */

import {
  readPersistedAuthProfileStoreRaw,
  writePersistedAuthProfileStoreRaw,
  readPersistedAuthProfileStateRaw,
  writePersistedAuthProfileStateRaw,
} from "./sqlite.js";

type AuthProfileSecretsStore = {
  version: number;
  providers: Record<string, unknown>;
  updatedAt?: number;
};

type AuthProfileStore = {
  secrets: AuthProfileSecretsStore;
  legacy?: Record<string, unknown>;
};

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

/** Coerces a raw persisted payload into a well-typed auth profile store. */
export function coercePersistedAuthProfileStore(raw: unknown): AuthProfileStore {
  if (!raw || typeof raw !== "object") {
    return { secrets: { version: 1, providers: {} } };
  }
  const obj = raw as Record<string, unknown>;
  const secrets = obj.secrets;
  if (!secrets || typeof secrets !== "object") {
    return { secrets: { version: 1, providers: {} }, ...(obj.legacy ? { legacy: obj.legacy as Record<string, unknown> } : {}) };
  }
  const secretsObj = secrets as Record<string, unknown>;
  return {
    secrets: {
      version: typeof secretsObj.version === "number" ? secretsObj.version : 1,
      providers: (secretsObj.providers && typeof secretsObj.providers === "object")
        ? secretsObj.providers as Record<string, unknown>
        : {},
      updatedAt: typeof secretsObj.updatedAt === "number" ? secretsObj.updatedAt : undefined,
    },
    ...(obj.legacy ? { legacy: obj.legacy as Record<string, unknown> } : {}),
  };
}

/** Merges two auth profile stores, preferring newer provider entries. */
export function mergeAuthProfileStores(
  base: AuthProfileStore,
  incoming: AuthProfileStore,
): AuthProfileStore {
  const mergedProviders = { ...base.secrets.providers };
  for (const [key, value] of Object.entries(incoming.secrets.providers)) {
    if (value !== undefined) {
      mergedProviders[key] = value;
    }
  }
  return {
    secrets: {
      version: Math.max(base.secrets.version, incoming.secrets.version),
      providers: mergedProviders,
      updatedAt: Date.now(),
    },
  };
}

/** Builds an empty persisted auth profile secrets store. */
export function buildPersistedAuthProfileSecretsStore(): AuthProfileSecretsStore {
  return { version: 1, providers: {}, updatedAt: Date.now() };
}

/** Applies legacy auth store entries into the modern store format. */
export function applyLegacyAuthStore(store: AuthProfileStore): AuthProfileStore {
  if (!store.legacy) return store;
  const providers = { ...store.secrets.providers };
  for (const [key, value] of Object.entries(store.legacy)) {
    if (!providers[key]) {
      providers[key] = value;
    }
  }
  return { secrets: { ...store.secrets, providers, updatedAt: Date.now() } };
}

/** Merges an OAuth file entry into the store. */
export function mergeOAuthFileIntoStore(
  store: AuthProfileStore,
  provider: string,
  oauthData: unknown,
): AuthProfileStore {
  const providers = { ...store.secrets.providers };
  providers[provider] = oauthData;
  return { secrets: { ...store.secrets, providers, updatedAt: Date.now() } };
}

/** Loads and coerces the persisted auth profile store from disk. */
export function loadPersistedAuthProfileStore(agentDir?: string): AuthProfileStore {
  const raw = readPersistedAuthProfileStoreRaw(agentDir);
  return coercePersistedAuthProfileStore(raw);
}

/** Loads and applies legacy auth profile entries. */
export function loadLegacyAuthProfileStore(agentDir?: string): AuthProfileStore {
  const store = loadPersistedAuthProfileStore(agentDir);
  return applyLegacyAuthStore(store);
}

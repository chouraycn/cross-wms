import { createHash } from "node:crypto";
import fs from "node:fs/promises";

function resolveNonNegativeIntegerOption(value: any, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  return fallback;
}

type DedupeCache = {
  check: (key: string | undefined | null, now?: number) => boolean;
  peek: (key: string | undefined | null, now?: number) => boolean;
  delete: (key: string | undefined | null) => void;
  clear: () => void;
  size: () => number;
};

function pruneMapToMaxSize<K, V>(map: Map<K, V>, maxSize: number): void {
  if (maxSize <= 0) {
    map.clear();
    return;
  }
  while (map.size > maxSize) {
    const firstKey = map.keys().next().value;
    if (firstKey !== undefined) {
      map.delete(firstKey);
    }
  }
}

function createDedupeCache(options: { ttlMs: number; maxSize: number }): DedupeCache {
  const ttlMs = resolveNonNegativeIntegerOption(options.ttlMs, 0);
  const maxSize = resolveNonNegativeIntegerOption(options.maxSize, 0);
  const cache = new Map<string, number>();

  const touch = (key: string, now: number) => {
    cache.delete(key);
    cache.set(key, now);
  };

  const prune = (now: number) => {
    const cutoff = ttlMs > 0 ? now - ttlMs : undefined;
    if (cutoff !== undefined) {
      for (const [entryKey, entryTs] of cache) {
        if (entryTs < cutoff) {
          cache.delete(entryKey);
        }
      }
    }
    if (maxSize <= 0) {
      cache.clear();
      return;
    }
    pruneMapToMaxSize(cache, maxSize);
  };

  const hasUnexpired = (key: string, now: number, touchOnRead: boolean): boolean => {
    const existing = cache.get(key);
    if (existing === undefined) {
      return false;
    }
    if (ttlMs > 0 && now - existing >= ttlMs) {
      cache.delete(key);
      return false;
    }
    if (touchOnRead) {
      touch(key, now);
    }
    return true;
  };

  return {
    check: (key, now = Date.now()) => {
      if (!key) {
        return false;
      }
      if (hasUnexpired(key, now, true)) {
        return true;
      }
      touch(key, now);
      prune(now);
      return false;
    },
    peek: (key, now = Date.now()) => {
      if (!key) {
        return false;
      }
      return hasUnexpired(key, now, false);
    },
    delete: (key) => {
      if (!key) {
        return;
      }
      cache.delete(key);
    },
    clear: () => {
      cache.clear();
    },
    size: () => cache.size,
  };
}

const LEGACY_PATH_OWNER_ID = "core:persistent-dedupe";
const DEFAULT_NAMESPACE_PREFIX = "persistent-dedupe";

export type PersistentDedupeEntry = {
  key: string;
  seenAt: number;
};

type PersistentDedupeBaseOptions = {
  ttlMs: number;
  memoryMaxSize: number;
  onDiskError?: (error: any) => void;
};

export type PersistentDedupePluginStateOptions = PersistentDedupeBaseOptions & {
  pluginId: string;
  namespacePrefix?: string;
  stateMaxEntries: number;
  env?: NodeJS.ProcessEnv;
  resolveFilePath?: undefined;
  fileMaxEntries?: undefined;
  lockOptions?: undefined;
};

export type PersistentDedupeLegacyPathOptions = PersistentDedupeBaseOptions & {
  pluginId?: undefined;
  stateMaxEntries?: undefined;
  namespacePrefix?: undefined;
  fileMaxEntries: number;
  resolveFilePath: (namespace: string) => string;
  env?: NodeJS.ProcessEnv;
  lockOptions?: any;
};

export type PersistentDedupeOptions =
  | PersistentDedupePluginStateOptions
  | PersistentDedupeLegacyPathOptions;

export type PersistentDedupeLegacyJsonMigrationResult = {
  imported: number;
  skippedExpired: number;
  skippedInvalid: number;
  skippedExisting: number;
  removed: boolean;
};

export type PersistentDedupeLegacyJsonMigrationOptions = PersistentDedupePluginStateOptions & {
  filePath: string;
  namespace: string;
  now?: number;
  removeFile?: boolean;
};

export type PersistentDedupeLegacyJsonImportEntry = {
  key: string;
  value: PersistentDedupeEntry;
  ttlMs?: number;
};

type PersistentDedupeLegacyJsonEntriesResult = {
  entries: PersistentDedupeLegacyJsonImportEntry[];
  skippedExpired: number;
  skippedInvalid: number;
};

export type PersistentDedupeCheckOptions = {
  namespace?: string;
  now?: number;
  onDiskError?: (error: any) => void;
};

export type PersistentDedupe = {
  checkAndRecord: (key: string, options?: PersistentDedupeCheckOptions) => Promise<boolean>;
  hasRecent: (key: string, options?: PersistentDedupeCheckOptions) => Promise<boolean>;
  forget: (key: string, options?: PersistentDedupeCheckOptions) => Promise<boolean>;
  warmup: (namespace?: string, onError?: (error: any) => void) => Promise<number>;
  clearMemory: () => void;
  memorySize: () => number;
};

export type ClaimableDedupeClaimResult =
  | { kind: "claimed" }
  | { kind: "duplicate" }
  | { kind: "inflight"; pending: Promise<boolean> };

export type ClaimableDedupeOptions =
  | PersistentDedupePluginStateOptions
  | PersistentDedupeLegacyPathOptions
  | {
      ttlMs: number;
      memoryMaxSize: number;
      pluginId?: undefined;
      stateMaxEntries?: undefined;
      namespacePrefix?: undefined;
      env?: undefined;
      resolveFilePath?: undefined;
      fileMaxEntries?: undefined;
      lockOptions?: undefined;
      onDiskError?: undefined;
    };

export type ClaimableDedupe = {
  claim: (
    key: string,
    options?: PersistentDedupeCheckOptions,
  ) => Promise<ClaimableDedupeClaimResult>;
  commit: (key: string, options?: PersistentDedupeCheckOptions) => Promise<boolean>;
  release: (
    key: string,
    options?: {
      namespace?: string;
      error?: any;
    },
  ) => void;
  hasRecent: (key: string, options?: PersistentDedupeCheckOptions) => Promise<boolean>;
  forget?: (key: string, options?: PersistentDedupeCheckOptions) => Promise<boolean>;
  warmup: (namespace?: string, onError?: (error: any) => void) => Promise<number>;
  clearMemory: () => void;
  memorySize: () => number;
};

function resolveNamespace(namespace?: string): string {
  return namespace?.trim() || "global";
}

function resolveScopedKey(namespace: string, key: string): string {
  return `${namespace}:${key}`;
}

function isRecentTimestamp(seenAt: number | undefined, ttlMs: number, now: number): boolean {
  return seenAt != null && (ttlMs <= 0 || now - seenAt < ttlMs);
}

function resolveEntrySeenAt(entry: PersistentDedupeEntry | undefined): number | undefined {
  return typeof entry?.seenAt === "number" && Number.isFinite(entry.seenAt)
    ? entry.seenAt
    : undefined;
}

function resolveUnknownEntrySeenAt(value: any): number | undefined {
  if (!value || typeof value !== "object" || !("seenAt" in value)) {
    return undefined;
  }
  return typeof value.seenAt === "number" && Number.isFinite(value.seenAt)
    ? value.seenAt
    : undefined;
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function resolveEntryKey(key: string): string {
  return `k.${shortHash(key)}`;
}

export function createPersistentDedupeImportEntry(params: {
  key: string;
  seenAt: number;
  ttlMs?: number;
}): PersistentDedupeLegacyJsonImportEntry {
  return {
    key: resolveEntryKey(params.key),
    value: { key: params.key, seenAt: params.seenAt },
    ...(params.ttlMs != null ? { ttlMs: params.ttlMs } : {}),
  };
}

function resolveRemainingTtlMs(
  seenAt: number,
  ttlMs: number,
  now: number,
): { ttlMs: number } | undefined | null {
  if (ttlMs <= 0) {
    return undefined;
  }
  const remaining = ttlMs - (now - seenAt);
  return remaining > 0 ? { ttlMs: Math.max(1, Math.floor(remaining)) } : null;
}

function normalizeNamespacePrefix(value: string | undefined): string {
  const normalized = (value ?? DEFAULT_NAMESPACE_PREFIX)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 48);
  return normalized || DEFAULT_NAMESPACE_PREFIX;
}

function resolveStateNamespace(prefix: string, namespace: string): string {
  return `${prefix}.${shortHash(namespace)}`;
}

export function resolvePersistentDedupePluginStateNamespace(options: {
  namespace: string;
  namespacePrefix?: string;
}): string {
  return resolveStateNamespace(
    normalizeNamespacePrefix(options.namespacePrefix),
    resolveNamespace(options.namespace),
  );
}

function hasPluginStateOptions(
  options: ClaimableDedupeOptions | PersistentDedupeOptions,
): options is PersistentDedupePluginStateOptions {
  return typeof (options as PersistentDedupePluginStateOptions).pluginId === "string";
}

function hasLegacyPathOptions(
  options: ClaimableDedupeOptions | PersistentDedupeOptions,
): options is PersistentDedupeLegacyPathOptions {
  return typeof (options as PersistentDedupeLegacyPathOptions).resolveFilePath === "function";
}

function resolveStateMaxEntries(options: PersistentDedupeOptions): number {
  const maxEntries = hasPluginStateOptions(options)
    ? options.stateMaxEntries
    : options.fileMaxEntries;
  return Math.max(1, resolveNonNegativeIntegerOption(maxEntries, 1));
}

function parseLegacyDedupeData(raw: string): {
  data: Record<string, number>;
  invalidCount: number;
} {
  const parsed = JSON.parse(raw) as any;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { data: {}, invalidCount: 0 };
  }
  const data: Record<string, number> = {};
  let invalidCount = 0;
  for (const [key, seenAt] of Object.entries(parsed)) {
    if (typeof seenAt === "number" && Number.isFinite(seenAt) && seenAt > 0) {
      data[key] = seenAt;
    } else {
      invalidCount++;
    }
  }
  return { data, invalidCount };
}

async function readPersistentDedupeLegacyJsonFileEntries(options: {
  filePath: string;
  ttlMs: number;
  now?: number;
}): Promise<PersistentDedupeLegacyJsonEntriesResult> {
  const raw = await fs.readFile(options.filePath, "utf8");
  const { data, invalidCount } = parseLegacyDedupeData(raw);
  const ttlMs = resolveNonNegativeIntegerOption(options.ttlMs, 0);
  const now = options.now ?? Date.now();
  const entries: PersistentDedupeLegacyJsonImportEntry[] = [];
  let skippedExpired = 0;

  for (const [key, seenAt] of Object.entries(data)) {
    const ttlOption = resolveRemainingTtlMs(seenAt, ttlMs, now);
    if (ttlOption === null) {
      skippedExpired++;
      continue;
    }
    entries.push(createPersistentDedupeImportEntry({ key, seenAt, ...ttlOption }));
  }

  return { entries, skippedExpired, skippedInvalid: invalidCount };
}

export async function listPersistentDedupeLegacyJsonFileEntries(options: {
  filePath: string;
  ttlMs: number;
  now?: number;
}): Promise<PersistentDedupeLegacyJsonImportEntry[]> {
  return (await readPersistentDedupeLegacyJsonFileEntries(options)).entries;
}

export function shouldReplacePersistentDedupeEntry(params: {
  existingValue: any;
  incomingValue: any;
}): boolean {
  const incomingSeenAt = resolveUnknownEntrySeenAt(params.incomingValue);
  return (
    incomingSeenAt != null &&
    incomingSeenAt > (resolveUnknownEntrySeenAt(params.existingValue) ?? 0)
  );
}

export function createPersistentDedupe(options: PersistentDedupeOptions): PersistentDedupe {
  const ttlMs = resolveNonNegativeIntegerOption(options.ttlMs, 0);
  const memoryMaxSize = resolveNonNegativeIntegerOption(options.memoryMaxSize, 0);
  const memory = createDedupeCache({ ttlMs, maxSize: memoryMaxSize });
  const inflight = new Map<string, Promise<boolean>>();

  const diskStore = new Map<string, Map<string, PersistentDedupeEntry>>();

  function getDiskStore(namespace: string): Map<string, PersistentDedupeEntry> {
    let store = diskStore.get(namespace);
    if (!store) {
      store = new Map();
      diskStore.set(namespace, store);
    }
    return store;
  }

  async function checkAndRecordInner(
    key: string,
    namespace: string,
    scopedKey: string,
    now: number,
    onDiskError?: (error: any) => void,
  ): Promise<boolean> {
    if (memory.check(scopedKey, now)) {
      return false;
    }

    try {
      const entryKey = resolveEntryKey(key);
      const store = getDiskStore(namespace);
      const existing = store.get(entryKey);
      const existingSeenAt = resolveEntrySeenAt(existing);
      if (isRecentTimestamp(existingSeenAt, ttlMs, now)) {
        memory.check(scopedKey, existingSeenAt);
        return false;
      }
      store.set(entryKey, { key, seenAt: now });
      memory.check(scopedKey, now);
      return true;
    } catch (error) {
      onDiskError?.(error);
      memory.check(scopedKey, now);
      return true;
    }
  }

  async function hasRecentInner(
    key: string,
    namespace: string,
    scopedKey: string,
    now: number,
    onDiskError?: (error: any) => void,
  ): Promise<boolean> {
    if (memory.peek(scopedKey, now)) {
      return true;
    }

    try {
      const seenAt = resolveEntrySeenAt(getDiskStore(namespace).get(resolveEntryKey(key)));
      if (!isRecentTimestamp(seenAt, ttlMs, now)) {
        return false;
      }
      memory.check(scopedKey, seenAt);
      return true;
    } catch (error) {
      onDiskError?.(error);
      return memory.peek(scopedKey, now);
    }
  }

  async function warmup(namespace = "global", onError?: (error: any) => void): Promise<number> {
    const now = Date.now();
    try {
      let loaded = 0;
      const store = getDiskStore(resolveNamespace(namespace));
      for (const entry of store.values()) {
        const ts = resolveEntrySeenAt(entry);
        if (ts == null) {
          continue;
        }
        if (ttlMs > 0 && now - ts >= ttlMs) {
          continue;
        }
        const scopedKey = `${resolveNamespace(namespace)}:${entry.key}`;
        memory.check(scopedKey, ts);
        loaded++;
      }
      return loaded;
    } catch (error) {
      onError?.(error);
      return 0;
    }
  }

  async function checkAndRecord(
    key: string,
    dedupeOptions?: PersistentDedupeCheckOptions,
  ): Promise<boolean> {
    const trimmed = key.trim();
    if (!trimmed) {
      return true;
    }
    const namespace = resolveNamespace(dedupeOptions?.namespace);
    const scopedKey = resolveScopedKey(namespace, trimmed);
    if (inflight.has(scopedKey)) {
      return false;
    }

    const onDiskError = dedupeOptions?.onDiskError ?? options.onDiskError;
    const now = dedupeOptions?.now ?? Date.now();
    const work = checkAndRecordInner(trimmed, namespace, scopedKey, now, onDiskError);
    inflight.set(scopedKey, work);
    try {
      return await work;
    } finally {
      inflight.delete(scopedKey);
    }
  }

  async function hasRecent(
    key: string,
    dedupeOptions?: PersistentDedupeCheckOptions,
  ): Promise<boolean> {
    const trimmed = key.trim();
    if (!trimmed) {
      return false;
    }
    const namespace = resolveNamespace(dedupeOptions?.namespace);
    const scopedKey = resolveScopedKey(namespace, trimmed);
    const onDiskError = dedupeOptions?.onDiskError ?? options.onDiskError;
    const now = dedupeOptions?.now ?? Date.now();
    return hasRecentInner(trimmed, namespace, scopedKey, now, onDiskError);
  }

  async function forget(
    key: string,
    dedupeOptions?: PersistentDedupeCheckOptions,
  ): Promise<boolean> {
    const trimmed = key.trim();
    if (!trimmed) {
      return false;
    }
    const namespace = resolveNamespace(dedupeOptions?.namespace);
    const scopedKey = resolveScopedKey(namespace, trimmed);
    memory.delete(scopedKey);

    try {
      const store = getDiskStore(namespace);
      const had = store.has(resolveEntryKey(trimmed));
      store.delete(resolveEntryKey(trimmed));
      return had;
    } catch (error) {
      (dedupeOptions?.onDiskError ?? options.onDiskError)?.(error);
      return false;
    }
  }

  return {
    checkAndRecord,
    hasRecent,
    forget,
    warmup,
    clearMemory: () => memory.clear(),
    memorySize: () => memory.size(),
  };
}

function createReleasedClaimError(scopedKey: string): Error {
  return new Error(`claim released before commit: ${scopedKey}`);
}

export function createClaimableDedupe(
  options: ClaimableDedupeOptions,
): ClaimableDedupe & Required<Pick<ClaimableDedupe, "forget">> {
  const ttlMs = resolveNonNegativeIntegerOption(options.ttlMs, 0);
  const memoryMaxSize = resolveNonNegativeIntegerOption(options.memoryMaxSize, 0);
  const memory = createDedupeCache({ ttlMs, maxSize: memoryMaxSize });
  let persistent: PersistentDedupe | null = null;
  if (hasPluginStateOptions(options)) {
    persistent = createPersistentDedupe({
      ttlMs,
      memoryMaxSize,
      pluginId: options.pluginId,
      stateMaxEntries: Math.max(1, resolveNonNegativeIntegerOption(options.stateMaxEntries, 1)),
      ...(options.namespacePrefix ? { namespacePrefix: options.namespacePrefix } : {}),
      ...(options.env ? { env: options.env } : {}),
      ...(options.onDiskError ? { onDiskError: options.onDiskError } : {}),
    });
  } else if (hasLegacyPathOptions(options)) {
    persistent = createPersistentDedupe({
      ttlMs,
      memoryMaxSize,
      fileMaxEntries: Math.max(1, resolveNonNegativeIntegerOption(options.fileMaxEntries, 1)),
      resolveFilePath: options.resolveFilePath,
      ...(options.env ? { env: options.env } : {}),
      ...(options.lockOptions ? { lockOptions: options.lockOptions } : {}),
      ...(options.onDiskError ? { onDiskError: options.onDiskError } : {}),
    });
  }

  const inflight = new Map<
    string,
    {
      promise: Promise<boolean>;
      resolve: (result: boolean) => void;
      reject: (error: any) => void;
    }
  >();

  async function hasRecent(
    key: string,
    dedupeOptions?: PersistentDedupeCheckOptions,
  ): Promise<boolean> {
    const trimmed = key.trim();
    if (!trimmed) {
      return false;
    }
    const namespace = resolveNamespace(dedupeOptions?.namespace);
    const scopedKey = resolveScopedKey(namespace, trimmed);
    if (persistent) {
      return persistent.hasRecent(trimmed, dedupeOptions);
    }
    return memory.peek(scopedKey, dedupeOptions?.now);
  }

  async function forget(
    key: string,
    dedupeOptions?: PersistentDedupeCheckOptions,
  ): Promise<boolean> {
    const trimmed = key.trim();
    if (!trimmed) {
      return false;
    }
    const namespace = resolveNamespace(dedupeOptions?.namespace);
    const scopedKey = resolveScopedKey(namespace, trimmed);
    const claimValue = inflight.get(scopedKey);
    claimValue?.reject(createReleasedClaimError(scopedKey));
    inflight.delete(scopedKey);
    if (persistent) {
      return persistent.forget(trimmed, dedupeOptions);
    }
    memory.delete(scopedKey);
    return true;
  }

  async function claim(
    key: string,
    dedupeOptions?: PersistentDedupeCheckOptions,
  ): Promise<ClaimableDedupeClaimResult> {
    const trimmed = key.trim();
    if (!trimmed) {
      return { kind: "claimed" };
    }
    const namespace = resolveNamespace(dedupeOptions?.namespace);
    const scopedKey = resolveScopedKey(namespace, trimmed);
    const existing = inflight.get(scopedKey);
    if (existing) {
      return { kind: "inflight", pending: existing.promise };
    }

    let resolve!: (result: boolean) => void;
    let reject!: (error: any) => void;
    const promise = new Promise<boolean>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    void promise.catch(() => {});
    inflight.set(scopedKey, { promise, resolve, reject });
    try {
      if (await hasRecent(trimmed, dedupeOptions)) {
        resolve(false);
        inflight.delete(scopedKey);
        return { kind: "duplicate" };
      }
      return { kind: "claimed" };
    } catch (error) {
      reject(error);
      inflight.delete(scopedKey);
      throw error;
    }
  }

  async function commit(
    key: string,
    dedupeOptions?: PersistentDedupeCheckOptions,
  ): Promise<boolean> {
    const trimmed = key.trim();
    if (!trimmed) {
      return true;
    }
    const namespace = resolveNamespace(dedupeOptions?.namespace);
    const scopedKey = resolveScopedKey(namespace, trimmed);
    const claimValue = inflight.get(scopedKey);
    try {
      const recorded = persistent
        ? await persistent.checkAndRecord(trimmed, dedupeOptions)
        : !memory.check(scopedKey, dedupeOptions?.now);
      claimValue?.resolve(recorded);
      return recorded;
    } catch (error) {
      claimValue?.reject(error);
      throw error;
    } finally {
      inflight.delete(scopedKey);
    }
  }

  function release(
    key: string,
    dedupeOptions?: {
      namespace?: string;
      error?: any;
    },
  ): void {
    const trimmed = key.trim();
    if (!trimmed) {
      return;
    }
    const namespace = resolveNamespace(dedupeOptions?.namespace);
    const scopedKey = resolveScopedKey(namespace, trimmed);
    const claimLocal = inflight.get(scopedKey);
    if (!claimLocal) {
      return;
    }
    claimLocal.reject(dedupeOptions?.error ?? createReleasedClaimError(scopedKey));
    inflight.delete(scopedKey);
  }

  return {
    claim,
    commit,
    release,
    hasRecent,
    forget,
    warmup: persistent?.warmup ?? (async () => 0),
    clearMemory: () => {
      persistent?.clearMemory();
      memory.clear();
    },
    memorySize: () => persistent?.memorySize() ?? memory.size(),
  };
}

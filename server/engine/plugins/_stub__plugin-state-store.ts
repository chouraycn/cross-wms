// Plugin state store — 增强内存实现
//
// 移植自 openclaw/src/plugin-state/plugin-state-store.ts + plugin-state-store.types.ts
// 保留核心 API（namespace/maxEntries/TTL/validation），使用内存 Map 替代 SQLite。
// 适用于开发环境和测试；生产环境需要 SQLite 持久化时可替换实现。

const NAMESPACE_PATTERN = /^[a-z0-9][a-z0-9._-]*$/iu;
const MAX_NAMESPACE_BYTES = 128;
const MAX_KEY_BYTES = 512;
const MAX_JSON_DEPTH = 64;

export const MAX_PLUGIN_STATE_VALUE_BYTES = 65_536;
export const MAX_PLUGIN_STATE_ENTRIES_PER_PLUGIN = 50_000;

const textEncoder = new TextEncoder();

// ===================== 类型定义 =====================

export type PluginStateEntry<T> = {
  key: string;
  value: T;
  createdAt: number;
  expiresAt?: number;
};

/** Async plugin state API exposed to plugin runtimes. */
export type PluginStateKeyedStore<T = unknown> = {
  register(key: string, value: T, opts?: { ttlMs?: number }): Promise<void>;
  registerIfAbsent(key: string, value: T, opts?: { ttlMs?: number }): Promise<boolean>;
  update?: (
    key: string,
    updateValue: (current: T | undefined) => T | undefined,
    opts?: { ttlMs?: number },
  ) => Promise<boolean>;
  lookup(key: string): Promise<T | undefined>;
  consume(key: string): Promise<T | undefined>;
  delete(key: string): Promise<boolean>;
  entries(): Promise<PluginStateEntry<T>[]>;
  clear(): Promise<void>;
};

/** Sync plugin state API used by trusted core/plugin bootstrap paths. */
export type PluginStateSyncKeyedStore<T = unknown> = {
  register(key: string, value: T, opts?: { ttlMs?: number }): void;
  registerIfAbsent(key: string, value: T, opts?: { ttlMs?: number }): boolean;
  update?: (
    key: string,
    updateValue: (current: T | undefined) => T | undefined,
    opts?: { ttlMs?: number },
  ) => boolean;
  lookup(key: string): T | undefined;
  consume(key: string): T | undefined;
  delete(key: string): boolean;
  entries(): PluginStateEntry<T>[];
  clear(): void;
};

/** Options for opening a keyed plugin-state namespace. */
export type OpenKeyedStoreOptions = {
  namespace: string;
  maxEntries: number;
  defaultTtlMs?: number;
  env?: NodeJS.ProcessEnv;
};

export type PluginStateStoreErrorCode =
  | "PLUGIN_STATE_SQLITE_UNAVAILABLE"
  | "PLUGIN_STATE_OPEN_FAILED"
  | "PLUGIN_STATE_WRITE_FAILED"
  | "PLUGIN_STATE_READ_FAILED"
  | "PLUGIN_STATE_CORRUPT"
  | "PLUGIN_STATE_LIMIT_EXCEEDED"
  | "PLUGIN_STATE_INVALID_INPUT";

export type PluginStateStoreOperation =
  | "load-sqlite"
  | "open"
  | "ensure-schema"
  | "register"
  | "lookup"
  | "consume"
  | "delete"
  | "entries"
  | "clear"
  | "sweep"
  | "probe"
  | "close";

export type PluginStateStoreErrorOptions = {
  code: PluginStateStoreErrorCode;
  operation: PluginStateStoreOperation;
  path?: string;
  cause?: unknown;
};

/** Typed error thrown for plugin-state validation failures. */
export class PluginStateStoreError extends Error {
  readonly code: PluginStateStoreErrorCode;
  readonly operation: PluginStateStoreOperation;
  readonly path?: string;

  constructor(message: string, options: PluginStateStoreErrorOptions) {
    super(message, { cause: options.cause });
    this.name = "PluginStateStoreError";
    this.code = options.code;
    this.operation = options.operation;
    if (options.path) {
      this.path = options.path;
    }
  }
}

// ===================== 验证逻辑 =====================

function invalidInput(
  message: string,
  operation: PluginStateStoreOperation = "register",
): PluginStateStoreError {
  return new PluginStateStoreError(message, {
    code: "PLUGIN_STATE_INVALID_INPUT",
    operation,
  });
}

function assertMaxBytes(
  label: string,
  value: string,
  max: number,
  operation: PluginStateStoreOperation = "register",
): void {
  if (textEncoder.encode(value).byteLength > max) {
    throw invalidInput(`plugin state ${label} must be <= ${max} bytes`, operation);
  }
}

function validateNamespace(value: string, operation: PluginStateStoreOperation = "open"): string {
  const trimmed = value.trim();
  if (!NAMESPACE_PATTERN.test(trimmed)) {
    throw invalidInput(`plugin state namespace must be a safe path segment: ${value}`, operation);
  }
  assertMaxBytes("namespace", trimmed, MAX_NAMESPACE_BYTES, operation);
  return trimmed;
}

function validateKey(value: string, operation: PluginStateStoreOperation = "register"): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw invalidInput("plugin state entry key must not be empty", operation);
  }
  assertMaxBytes("entry key", trimmed, MAX_KEY_BYTES, operation);
  return trimmed;
}

function validateMaxEntries(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw invalidInput("plugin state maxEntries must be an integer >= 1", "open");
  }
  return value;
}

function validateOptionalTtlMs(
  value: number | undefined,
  operation: PluginStateStoreOperation = "register",
): number | undefined {
  if (value == null) {
    return undefined;
  }
  if (!Number.isSafeInteger(value) || value < 1) {
    throw invalidInput("plugin state ttlMs must be a positive integer", operation);
  }
  return value;
}

function assertPlainJsonValue(
  value: unknown,
  seen: WeakSet<object>,
  path: string,
  depth = 0,
): void {
  if (depth > MAX_JSON_DEPTH) {
    throw new PluginStateStoreError(
      `plugin state value nesting exceeds maximum depth of ${MAX_JSON_DEPTH}`,
      { code: "PLUGIN_STATE_LIMIT_EXCEEDED", operation: "register" },
    );
  }
  if (value === null) return;
  const valueType = typeof value;
  if (valueType === "string" || valueType === "boolean") return;
  if (valueType === "number") {
    if (!Number.isFinite(value)) {
      throw invalidInput(`plugin state value at ${path} must be a finite number`);
    }
    return;
  }
  if (valueType !== "object") {
    throw invalidInput(`plugin state value at ${path} must be JSON-serializable`);
  }

  const objectValue = value as object;
  if (seen.has(objectValue)) {
    throw invalidInput(`plugin state value at ${path} must not contain circular references`);
  }
  seen.add(objectValue);
  try {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        if (!(index in value)) {
          throw invalidInput(`plugin state array at ${path} must not be sparse`);
        }
        assertPlainJsonValue(value[index], seen, `${path}[${index}]`, depth + 1);
      }
      return;
    }

    if (Object.getPrototypeOf(objectValue) !== Object.prototype) {
      throw invalidInput(`plugin state object at ${path} must be a plain object`);
    }

    const descriptorEntries = Object.entries(Object.getOwnPropertyDescriptors(objectValue));
    const enumerableKeys = Object.keys(objectValue);
    if (Object.getOwnPropertySymbols(objectValue).length > 0) {
      throw invalidInput(`plugin state object at ${path} must not use symbol keys`);
    }
    if (descriptorEntries.length !== enumerableKeys.length) {
      throw invalidInput(`plugin state object at ${path} must not use non-enumerable properties`);
    }
    for (const [key, descriptor] of descriptorEntries) {
      if (descriptor.get || descriptor.set || !("value" in descriptor)) {
        throw invalidInput(`plugin state object at ${path}.${key} must use data properties`);
      }
      assertPlainJsonValue(descriptor.value, seen, `${path}.${key}`, depth + 1);
    }
  } finally {
    seen.delete(objectValue);
  }
}

function assertJsonSerializable(value: unknown): void {
  assertPlainJsonValue(value, new WeakSet<object>(), "value");
}

function prepareRegisterParams(
  key: string,
  value: unknown,
  defaultTtlMs?: number,
  opts?: { ttlMs?: number },
): { key: string; value: unknown; ttlMs?: number } {
  const normalizedKey = validateKey(key, "register");
  assertJsonSerializable(value);
  const ttlMs = validateOptionalTtlMs(opts?.ttlMs, "register") ?? defaultTtlMs;
  return { key: normalizedKey, value, ...(ttlMs != null ? { ttlMs } : {}) };
}

// ===================== 内存存储实现 =====================

type StoredEntry = {
  key: string;
  value: unknown;
  createdAt: number;
  expiresAt: number | null;
};

type NamespaceStore = Map<string, StoredEntry>;
const pluginStores = new Map<string, Map<string, NamespaceStore>>();

function getNamespaceStore(pluginId: string, namespace: string): NamespaceStore {
  let pluginMap = pluginStores.get(pluginId);
  if (!pluginMap) {
    pluginMap = new Map();
    pluginStores.set(pluginId, pluginMap);
  }
  let nsStore = pluginMap.get(namespace);
  if (!nsStore) {
    nsStore = new Map();
    pluginMap.set(namespace, nsStore);
  }
  return nsStore;
}

function isExpired(entry: StoredEntry, now: number): boolean {
  return entry.expiresAt !== null && entry.expiresAt <= now;
}

function sweepExpired(store: NamespaceStore, now: number): void {
  for (const [key, entry] of store) {
    if (isExpired(entry, now)) {
      store.delete(key);
    }
  }
}

function enforceMaxEntries(
  store: NamespaceStore,
  maxEntries: number,
  protectedKey: string,
): void {
  if (store.size <= maxEntries) return;
  const entries = [...store.entries()]
    .filter(([key]) => key !== protectedKey)
    .sort((a, b) => a[1].createdAt - b[1].createdAt);
  const toDelete = entries.length - (maxEntries - 1);
  for (let i = 0; i < toDelete && i < entries.length; i++) {
    store.delete(entries[i][0]);
  }
}

function createKeyedStore<T>(
  pluginId: string,
  options: OpenKeyedStoreOptions,
  sync: false,
): PluginStateKeyedStore<T>;
function createKeyedStore<T>(
  pluginId: string,
  options: OpenKeyedStoreOptions,
  sync: true,
): PluginStateSyncKeyedStore<T>;
function createKeyedStore<T>(
  pluginId: string,
  options: OpenKeyedStoreOptions,
  sync: boolean,
): PluginStateKeyedStore<T> | PluginStateSyncKeyedStore<T> {
  const namespace = validateNamespace(options.namespace);
  const maxEntries = validateMaxEntries(options.maxEntries);
  const defaultTtlMs = validateOptionalTtlMs(options.defaultTtlMs);

  const doRegister = (key: string, value: T, opts?: { ttlMs?: number }): void => {
    const params = prepareRegisterParams(key, value, defaultTtlMs, opts);
    const now = Date.now();
    const store = getNamespaceStore(pluginId, namespace);
    sweepExpired(store, now);
    const expiresAt = params.ttlMs != null ? now + params.ttlMs : null;
    store.set(params.key, {
      key: params.key,
      value: params.value,
      createdAt: now,
      expiresAt,
    });
    enforceMaxEntries(store, maxEntries, params.key);
  };

  const doRegisterIfAbsent = (key: string, value: T, opts?: { ttlMs?: number }): boolean => {
    const params = prepareRegisterParams(key, value, defaultTtlMs, opts);
    const now = Date.now();
    const store = getNamespaceStore(pluginId, namespace);
    sweepExpired(store, now);
    const existing = store.get(params.key);
    if (existing && !isExpired(existing, now)) {
      return false;
    }
    const expiresAt = params.ttlMs != null ? now + params.ttlMs : null;
    store.set(params.key, {
      key: params.key,
      value: params.value,
      createdAt: now,
      expiresAt,
    });
    enforceMaxEntries(store, maxEntries, params.key);
    return true;
  };

  const doUpdate = (
    key: string,
    updateValue: (current: T | undefined) => T | undefined,
    opts?: { ttlMs?: number },
  ): boolean => {
    const normalizedKey = validateKey(key, "register");
    const now = Date.now();
    const store = getNamespaceStore(pluginId, namespace);
    sweepExpired(store, now);
    const existing = store.get(normalizedKey);
    const current = existing && !isExpired(existing, now) ? (existing.value as T) : undefined;
    const next = updateValue(current);
    if (next === undefined) return false;
    assertJsonSerializable(next);
    const ttlMs = validateOptionalTtlMs(opts?.ttlMs, "register") ?? defaultTtlMs;
    const expiresAt = ttlMs != null ? now + ttlMs : null;
    store.set(normalizedKey, {
      key: normalizedKey,
      value: next,
      createdAt: now,
      expiresAt,
    });
    enforceMaxEntries(store, maxEntries, normalizedKey);
    return true;
  };

  const doLookup = (key: string): T | undefined => {
    const normalizedKey = validateKey(key, "lookup");
    const now = Date.now();
    const store = getNamespaceStore(pluginId, namespace);
    const entry = store.get(normalizedKey);
    if (!entry || isExpired(entry, now)) {
      if (entry) store.delete(normalizedKey);
      return undefined;
    }
    return entry.value as T;
  };

  const doConsume = (key: string): T | undefined => {
    const normalizedKey = validateKey(key, "consume");
    const now = Date.now();
    const store = getNamespaceStore(pluginId, namespace);
    const entry = store.get(normalizedKey);
    if (!entry || isExpired(entry, now)) {
      if (entry) store.delete(normalizedKey);
      return undefined;
    }
    store.delete(normalizedKey);
    return entry.value as T;
  };

  const doDelete = (key: string): boolean => {
    const normalizedKey = validateKey(key, "delete");
    const store = getNamespaceStore(pluginId, namespace);
    return store.delete(normalizedKey);
  };

  const doEntries = (): PluginStateEntry<T>[] => {
    const now = Date.now();
    const store = getNamespaceStore(pluginId, namespace);
    sweepExpired(store, now);
    const result: PluginStateEntry<T>[] = [];
    for (const entry of store.values()) {
      if (!isExpired(entry, now)) {
        result.push({
          key: entry.key,
          value: entry.value as T,
          createdAt: entry.createdAt,
          ...(entry.expiresAt != null ? { expiresAt: entry.expiresAt } : {}),
        });
      }
    }
    return result.sort((a, b) => a.createdAt - b.createdAt || a.key.localeCompare(b.key));
  };

  const doClear = (): void => {
    const store = getNamespaceStore(pluginId, namespace);
    store.clear();
  };

  if (sync) {
    return {
      register: doRegister,
      registerIfAbsent: doRegisterIfAbsent,
      update: doUpdate,
      lookup: doLookup,
      consume: doConsume,
      delete: doDelete,
      entries: doEntries,
      clear: doClear,
    };
  }

  return {
    register: async (k, v, o) => doRegister(k, v, o),
    registerIfAbsent: async (k, v, o) => doRegisterIfAbsent(k, v, o),
    update: async (k, fn, o) => doUpdate(k, fn, o),
    lookup: async (k) => doLookup(k),
    consume: async (k) => doConsume(k),
    delete: async (k) => doDelete(k),
    entries: async () => doEntries(),
    clear: async () => doClear(),
  };
}

/** Opens an async plugin-state namespace for a non-core plugin id. */
export function createPluginStateKeyedStore<T>(
  pluginId: string,
  options: OpenKeyedStoreOptions,
): PluginStateKeyedStore<T>;
export function createPluginStateKeyedStore<T>(
  options: OpenKeyedStoreOptions,
): PluginStateKeyedStore<T>;
export function createPluginStateKeyedStore<T>(
  pluginIdOrOptions: string | OpenKeyedStoreOptions,
  maybeOptions?: OpenKeyedStoreOptions,
): PluginStateKeyedStore<T> {
  const { pluginId, options } =
    typeof pluginIdOrOptions === "string"
      ? { pluginId: pluginIdOrOptions, options: maybeOptions! }
      : { pluginId: "_legacy", options: pluginIdOrOptions };

  if (pluginId.startsWith("core:") && pluginId !== "_legacy") {
    throw invalidInput("Plugin ids starting with 'core:' are reserved for core consumers.", "open");
  }
  return createKeyedStore<T>(pluginId, options, false);
}

/** Opens a sync plugin-state namespace for a non-core plugin id. */
export function createPluginStateSyncKeyedStore<T>(
  pluginId: string,
  options: OpenKeyedStoreOptions,
): PluginStateSyncKeyedStore<T> {
  if (pluginId.startsWith("core:")) {
    throw invalidInput("Plugin ids starting with 'core:' are reserved for core consumers.", "open");
  }
  return createKeyedStore<T>(pluginId, options, true);
}

/** Opens a sync plugin-state namespace for a trusted core owner id. */
export function createCorePluginStateSyncKeyedStore<T>(
  options: OpenKeyedStoreOptions & { ownerId: `core:${string}` },
): PluginStateSyncKeyedStore<T> {
  return createKeyedStore<T>(options.ownerId, options, true);
}

/** Clears all plugin-state stores for tests. */
export function clearPluginStateStoreForTests(): void {
  pluginStores.clear();
}

/** Resets plugin-state module state for isolated tests. */
export function resetPluginStateStoreForTests(_options: { closeDatabase?: boolean } = {}): void {
  pluginStores.clear();
}

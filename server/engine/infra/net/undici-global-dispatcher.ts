// Global Undici dispatcher setup keeps process-wide proxy routing, HTTP/1-only
// enforcement, and long stream timeouts aligned across root fetch imports.
// 移植自 openclaw/src/infra/net/undici-global-dispatcher.ts
// 降级：
//  - @openclaw/proxyline/dispatcher-brand 未移植 → isProxylineDispatcher 内联为返回 false
//  - ./proxy-env.js 缺少 hasEnvHttpProxyAgentConfigured/resolveEnvHttpProxyAgentOptions
//    → 内联实现（不修改已有 proxy-env.ts）
//  - ./proxy/managed-proxy-undici.js → ../managed-proxy-undici.js（已有 stub）
import { addActiveManagedProxyTlsOptions } from "../managed-proxy-undici.js";
import {
  createUndiciAutoSelectFamilyConnectOptions,
  resolveUndiciAutoSelectFamily,
  withTemporaryUndiciAutoSelectFamily,
} from "./undici-family-policy.js";
import {
  createHttp1Agent,
  createHttp1EnvHttpProxyAgent,
  loadUndiciGlobalDispatcherDeps,
  type UndiciGlobalDispatcherDeps,
} from "./undici-runtime.js";

export const DEFAULT_UNDICI_STREAM_TIMEOUT_MS = 30 * 60 * 1000;
const HTTP1_ONLY_DISPATCHER_OPTIONS = Object.freeze({
  allowH2: false as const,
});

/**
 * Module-level bridge so `resolveDispatcherTimeoutMs` in fetch-guard.ts
 * can read the global dispatcher timeout without relying on Undici's
 * non-public `.options` field.
 */
export let globalUndiciStreamTimeoutMs: number | undefined;

let lastAppliedTimeoutKey: string | null = null;
let lastAppliedProxyBootstrapKey: string | null = null;

// ============================================================================
// 降级：@openclaw/proxyline/dispatcher-brand — proxyline 在 cross-wms 中不可用
// ============================================================================

/** proxyline dispatcher 品牌检测（降级：始终返回 false）。 */
function isProxylineDispatcher(_dispatcher: unknown): boolean {
  return false;
}

// ============================================================================
// 降级：./proxy-env.js 缺少的 EnvHttpProxyAgent 选项解析（内联实现）
// ============================================================================

const PROXY_ENV_KEYS = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
] as const;

function normalizeProxyEnvValue(value: string | undefined): string | null | undefined {
  // Empty lowercase env vars intentionally shadow uppercase values, matching
  // undici's EnvHttpProxyAgent precedence.
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Explicit proxy option shape accepted by undici EnvHttpProxyAgent. */
type EnvHttpProxyAgentProxyOptions = {
  httpProxy?: string;
  httpsProxy?: string;
};

/** Match undici EnvHttpProxyAgent semantics for env-based HTTP/S proxy selection. */
function resolveEnvHttpProxyUrl(
  protocol: "http" | "https",
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const lowerHttpProxy = normalizeProxyEnvValue(env.http_proxy);
  const lowerHttpsProxy = normalizeProxyEnvValue(env.https_proxy);
  const httpProxy =
    lowerHttpProxy !== undefined ? lowerHttpProxy : normalizeProxyEnvValue(env.HTTP_PROXY);
  const httpsProxy =
    lowerHttpsProxy !== undefined ? lowerHttpsProxy : normalizeProxyEnvValue(env.HTTPS_PROXY);
  if (protocol === "https") {
    return httpsProxy ?? httpProxy ?? undefined;
  }
  return httpProxy ?? undefined;
}

function resolveEnvAllProxyUrl(env: NodeJS.ProcessEnv): string | undefined {
  const lowerAllProxy = normalizeProxyEnvValue(env.all_proxy);
  const allProxy =
    lowerAllProxy !== undefined ? lowerAllProxy : normalizeProxyEnvValue(env.ALL_PROXY);
  return allProxy ?? undefined;
}

/** Build explicit options for undici's EnvHttpProxyAgent. */
function resolveEnvHttpProxyAgentOptions(
  env: NodeJS.ProcessEnv = process.env,
): EnvHttpProxyAgentProxyOptions | undefined {
  const allProxy = resolveEnvAllProxyUrl(env);
  const httpProxy = resolveEnvHttpProxyUrl("http", env) ?? allProxy;
  const httpsProxy = resolveEnvHttpProxyUrl("https", env) ?? httpProxy;
  const options: EnvHttpProxyAgentProxyOptions = {
    ...(httpProxy ? { httpProxy } : {}),
    ...(httpsProxy ? { httpsProxy } : {}),
  };
  return options.httpProxy || options.httpsProxy ? options : undefined;
}

/** Return whether explicit EnvHttpProxyAgent options can be built from the environment. */
function hasEnvHttpProxyAgentConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveEnvHttpProxyAgentOptions(env) !== undefined;
}

// ============================================================================
// Dispatcher bookkeeping
// ============================================================================

type DispatcherKind = "agent" | "env-proxy" | "proxyline-managed" | "unsupported";
type SupportedDispatcherKind = Exclude<DispatcherKind, "unsupported">;
type UndiciDispatcher = Parameters<UndiciGlobalDispatcherDeps["setGlobalDispatcher"]>[0];
type UndiciDispatchOptions = Parameters<UndiciDispatcher["dispatch"]>[0];
type UndiciDispatchHandler = Parameters<UndiciDispatcher["dispatch"]>[1];
type CurrentDispatcherInfo = {
  kind: SupportedDispatcherKind;
  dispatcher: UndiciDispatcher;
};
type TimedProxylineManagedDispatcherState = {
  autoSelectFamily: boolean | undefined;
  timeoutMs: number;
  dispatch: UndiciDispatcher["dispatch"];
};

const UNDICI_DISPATCH_HELPER_METHODS = new Set<PropertyKey>([
  "compose",
  "connect",
  "pipeline",
  "request",
  "stream",
  "upgrade",
]);
const UNDICI_DISPATCHER_LIFECYCLE_METHODS = new Set<PropertyKey>(["close", "destroy"]);

const timedProxylineManagedDispatchers = new WeakMap<
  object,
  TimedProxylineManagedDispatcherState
>();

function isTimedProxylineManagedDispatcher(dispatcher: unknown): dispatcher is UndiciDispatcher {
  return typeof dispatcher === "object" && dispatcher !== null
    ? timedProxylineManagedDispatchers.has(dispatcher)
    : false;
}

function withDefaultDispatchTimeout(
  timeout: UndiciDispatchOptions["bodyTimeout"],
  timeoutMs: number,
): UndiciDispatchOptions["bodyTimeout"] {
  return timeout == null ? timeoutMs : timeout;
}

function createTimedProxylineManagedDispatcher(
  dispatcher: UndiciDispatcher,
  timeoutMs: number,
  autoSelectFamily: boolean | undefined,
): UndiciDispatcher {
  const existingState = timedProxylineManagedDispatchers.get(dispatcher);
  if (existingState) {
    // Managed proxy dispatchers may be reconfigured in place; update the shared
    // state so existing wrappers pick up timeout/family changes without nesting.
    existingState.autoSelectFamily = autoSelectFamily;
    existingState.timeoutMs = timeoutMs;
    return dispatcher;
  }

  const state: TimedProxylineManagedDispatcherState = {
    autoSelectFamily,
    timeoutMs,
    dispatch(options: UndiciDispatchOptions, handler: UndiciDispatchHandler): boolean {
      return withTemporaryUndiciAutoSelectFamily(state.autoSelectFamily, () =>
        dispatcher.dispatch(
          {
            ...options,
            bodyTimeout: withDefaultDispatchTimeout(options.bodyTimeout, state.timeoutMs),
            headersTimeout: withDefaultDispatchTimeout(options.headersTimeout, state.timeoutMs),
            ...HTTP1_ONLY_DISPATCHER_OPTIONS,
          },
          handler,
        ),
      );
    },
  };
  const proxy = new Proxy(dispatcher, {
    get(target, property, receiver) {
      if (property === "dispatch") {
        return state.dispatch;
      }
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") {
        return value;
      }
      if (UNDICI_DISPATCHER_LIFECYCLE_METHODS.has(property)) {
        // Lifecycle calls must hit the original dispatcher so close/destroy do
        // not recurse through helper methods that intentionally see the proxy.
        return value.bind(target);
      }
      if (UNDICI_DISPATCH_HELPER_METHODS.has(property)) {
        // Undici helper methods expect the dispatcher proxy as `this` so they
        // still route through our wrapped dispatch implementation.
        return (...args: unknown[]) => Reflect.apply(value, receiver, args);
      }
      return value;
    },
  });
  timedProxylineManagedDispatchers.set(proxy, state);
  return proxy;
}

function resolveDispatcherKind(dispatcher: unknown): DispatcherKind {
  const ctorName = (dispatcher as { constructor?: { name?: string } })?.constructor?.name;
  if (typeof ctorName !== "string" || ctorName.length === 0) {
    return "unsupported";
  }
  if (ctorName.includes("EnvHttpProxyAgent")) {
    return "env-proxy";
  }
  if (isTimedProxylineManagedDispatcher(dispatcher) || isProxylineDispatcher(dispatcher)) {
    return "proxyline-managed";
  }
  if (ctorName.includes("ProxyAgent")) {
    return "unsupported";
  }
  if (ctorName.includes("Agent")) {
    return "agent";
  }
  return "unsupported";
}

function resolveDispatcherKey(params: {
  kind: DispatcherKind;
  timeoutMs: number;
  autoSelectFamily: boolean | undefined;
}): string {
  const autoSelectToken =
    params.autoSelectFamily === undefined ? "na" : params.autoSelectFamily ? "on" : "off";
  return `${params.kind}:${params.timeoutMs}:${autoSelectToken}`;
}

function resolveEnvProxyDispatcherOptions(): ConstructorParameters<
  UndiciGlobalDispatcherDeps["EnvHttpProxyAgent"]
>[0] {
  // cross-wms 的 managed-proxy-undici.ts 是 stub（返回 unknown），需强转为 object。
  const managedTls = addActiveManagedProxyTlsOptions(resolveEnvHttpProxyAgentOptions()) as
    | object
    | undefined;
  return {
    ...(managedTls ?? {}),
    ...HTTP1_ONLY_DISPATCHER_OPTIONS,
  } as ConstructorParameters<UndiciGlobalDispatcherDeps["EnvHttpProxyAgent"]>[0];
}

function resolveEnvProxyBootstrapKey(
  options: ConstructorParameters<UndiciGlobalDispatcherDeps["EnvHttpProxyAgent"]>[0],
): string {
  const entries = Object.entries((options ?? {}) as Record<string, unknown>)
    .filter(([, value]) => value !== undefined)
    .toSorted(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
}

function resolveStreamTimeoutMs(opts?: { timeoutMs?: number }): number | null {
  const timeoutMsRaw = opts?.timeoutMs ?? DEFAULT_UNDICI_STREAM_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMsRaw)) {
    return null;
  }
  return Math.max(DEFAULT_UNDICI_STREAM_TIMEOUT_MS, Math.floor(timeoutMsRaw));
}

function resolveCurrentDispatcherKind(
  runtime: Pick<UndiciGlobalDispatcherDeps, "getGlobalDispatcher">,
): SupportedDispatcherKind | null {
  return resolveCurrentDispatcherInfo(runtime)?.kind ?? null;
}

function resolveCurrentDispatcherInfo(
  runtime: Pick<UndiciGlobalDispatcherDeps, "getGlobalDispatcher">,
): CurrentDispatcherInfo | null {
  let dispatcher: unknown;
  try {
    dispatcher = runtime.getGlobalDispatcher();
  } catch {
    return null;
  }

  const currentKind = resolveDispatcherKind(dispatcher);
  if (currentKind === "unsupported") {
    return null;
  }
  return {
    kind: currentKind,
    dispatcher: dispatcher as UndiciDispatcher,
  };
}

/** Installs the env-proxy global dispatcher once proxy env is available. */
export function ensureGlobalUndiciEnvProxyDispatcher(): void {
  const shouldUseEnvProxy = hasEnvHttpProxyAgentConfigured();
  if (!shouldUseEnvProxy) {
    return;
  }
  const runtime = loadUndiciGlobalDispatcherDeps();
  const { setGlobalDispatcher } = runtime;
  const proxyOptions = resolveEnvProxyDispatcherOptions();
  const nextBootstrapKey = resolveEnvProxyBootstrapKey(proxyOptions);
  const currentKind = resolveCurrentDispatcherKind(runtime);
  if (currentKind === null) {
    return;
  }
  if (currentKind === "proxyline-managed") {
    lastAppliedProxyBootstrapKey = nextBootstrapKey;
    return;
  }
  if (currentKind === "env-proxy" && lastAppliedProxyBootstrapKey === null) {
    lastAppliedProxyBootstrapKey = nextBootstrapKey;
    return;
  }
  if (currentKind === "env-proxy" && lastAppliedProxyBootstrapKey === nextBootstrapKey) {
    return;
  }
  try {
    setGlobalDispatcher(createHttp1EnvHttpProxyAgent(proxyOptions));
    lastAppliedProxyBootstrapKey = nextBootstrapKey;
  } catch {
    // Best-effort bootstrap only.
  }
}

function applyGlobalDispatcherStreamTimeouts(params: {
  runtime: UndiciGlobalDispatcherDeps;
  dispatcher: UndiciDispatcher;
  kind: SupportedDispatcherKind;
  timeoutMs: number;
}): void {
  const { runtime, dispatcher, kind, timeoutMs } = params;
  const autoSelectFamily = resolveUndiciAutoSelectFamily();
  const nextKey = resolveDispatcherKey({
    kind,
    timeoutMs,
    autoSelectFamily,
  });
  const needsProxylineWrapper =
    kind === "proxyline-managed" && !isTimedProxylineManagedDispatcher(dispatcher);
  if (lastAppliedTimeoutKey === nextKey && !needsProxylineWrapper) {
    return;
  }

  const connect = createUndiciAutoSelectFamilyConnectOptions(autoSelectFamily);
  try {
    if (kind === "proxyline-managed") {
      runtime.setGlobalDispatcher(
        createTimedProxylineManagedDispatcher(dispatcher, timeoutMs, autoSelectFamily),
      );
    } else if (kind === "env-proxy") {
      // cross-wms 的 managed-proxy-undici.ts 是 stub（返回 unknown），需强转为 object。
      const managedTls = addActiveManagedProxyTlsOptions(resolveEnvHttpProxyAgentOptions()) as
        | object
        | undefined;
      const proxyOptions = {
        ...(managedTls ?? {}),
        bodyTimeout: timeoutMs,
        headersTimeout: timeoutMs,
        ...(connect ? { connect } : {}),
        ...HTTP1_ONLY_DISPATCHER_OPTIONS,
      } as ConstructorParameters<UndiciGlobalDispatcherDeps["EnvHttpProxyAgent"]>[0];
      runtime.setGlobalDispatcher(createHttp1EnvHttpProxyAgent(proxyOptions, timeoutMs));
    } else {
      runtime.setGlobalDispatcher(createHttp1Agent(connect ? { connect } : undefined, timeoutMs));
    }
    lastAppliedTimeoutKey = nextKey;
  } catch {
    // Best-effort hardening only.
  }
}

/**
 * Records the stream timeout bridge and applies it only when the current global
 * dispatcher already uses env or managed proxy routing.
 */
export function ensureGlobalUndiciStreamTimeouts(opts?: { timeoutMs?: number }): void {
  const timeoutMs = resolveStreamTimeoutMs(opts);
  if (timeoutMs === null) {
    return;
  }
  globalUndiciStreamTimeoutMs = timeoutMs;
  if (!hasEnvHttpProxyAgentConfigured()) {
    lastAppliedTimeoutKey = null;
    return;
  }
  const runtime = loadUndiciGlobalDispatcherDeps();
  const current = resolveCurrentDispatcherInfo(runtime);
  if (current === null) {
    return;
  }
  if (current.kind !== "env-proxy" && current.kind !== "proxyline-managed") {
    return;
  }

  applyGlobalDispatcherStreamTimeouts({
    runtime,
    dispatcher: current.dispatcher,
    kind: current.kind,
    timeoutMs,
  });
}

/** Forces timeout/family policy onto the current supported global dispatcher. */
export function ensureGlobalUndiciDispatcherStreamTimeouts(opts?: { timeoutMs?: number }): void {
  const timeoutMs = resolveStreamTimeoutMs(opts);
  if (timeoutMs === null) {
    return;
  }
  globalUndiciStreamTimeoutMs = timeoutMs;
  const runtime = loadUndiciGlobalDispatcherDeps();
  const current = resolveCurrentDispatcherInfo(runtime);
  if (current === null) {
    return;
  }
  applyGlobalDispatcherStreamTimeouts({
    runtime,
    dispatcher: current.dispatcher,
    kind: current.kind,
    timeoutMs,
  });
}

/** Clears module-level dispatcher bookkeeping between isolated tests. */
export function resetGlobalUndiciStreamTimeoutsForTests(): void {
  lastAppliedTimeoutKey = null;
  lastAppliedProxyBootstrapKey = null;
  globalUndiciStreamTimeoutMs = undefined;
}

/**
 * Re-evaluate proxy env changes for root undici imports. Installs
 * EnvHttpProxyAgent when proxy env is present, and restores a direct Agent
 * after proxy env is cleared.
 */
export function forceResetGlobalDispatcher(opts?: { preserveProxylineManaged?: boolean }): void {
  lastAppliedTimeoutKey = null;
  if (!hasEnvHttpProxyAgentConfigured()) {
    if (lastAppliedProxyBootstrapKey === null) {
      return;
    }
    lastAppliedProxyBootstrapKey = null;
    try {
      const { setGlobalDispatcher } = loadUndiciGlobalDispatcherDeps();
      setGlobalDispatcher(createHttp1Agent());
    } catch {
      // Best-effort reset only.
    }
    return;
  }
  try {
    const runtime = loadUndiciGlobalDispatcherDeps();
    const { setGlobalDispatcher } = runtime;
    const proxyOptions = resolveEnvProxyDispatcherOptions();
    if (opts?.preserveProxylineManaged) {
      const current = resolveCurrentDispatcherInfo(runtime);
      if (current?.kind === "proxyline-managed") {
        lastAppliedProxyBootstrapKey = resolveEnvProxyBootstrapKey(proxyOptions);
        return;
      }
    }
    setGlobalDispatcher(createHttp1EnvHttpProxyAgent(proxyOptions));
    lastAppliedProxyBootstrapKey = resolveEnvProxyBootstrapKey(proxyOptions);
  } catch {
    // Best-effort reset only.
  }
}

// 移植自 openclaw/src/infra/net/proxy/proxy-lifecycle.ts
// 托管代理生命周期管理

import type { ProxyConfig } from "../_runtime-stubs.js";
import {
  getActiveManagedProxyLoopbackMode,
  getActiveManagedProxyUrl,
  registerActiveManagedProxyUrl,
  stopActiveManagedProxyRegistration,
  type ActiveManagedProxyRegistration,
} from "./active-proxy-state.js";

type ProxyLoopbackMode = "gateway-only" | "proxy" | "block";

export type ProxyHandle = {
  proxyUrl: string;
  stop: () => Promise<void>;
  kill: (signal?: NodeJS.Signals) => void;
};

const PROXY_ENV_KEYS = ["http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY"] as const;
const NO_PROXY_ENV_KEYS = ["no_proxy", "NO_PROXY"] as const;
const PROXY_ACTIVE_KEYS = [
  "OPENCLAW_PROXY_ACTIVE",
  "OPENCLAW_PROXY_LOOPBACK_MODE",
  "OPENCLAW_PROXY_CA_FILE",
] as const;
const ALL_PROXY_ENV_KEYS = [...PROXY_ENV_KEYS, ...NO_PROXY_ENV_KEYS, ...PROXY_ACTIVE_KEYS] as const;
type ProxyEnvKey = (typeof ALL_PROXY_ENV_KEYS)[number];
type ProxyEnvSnapshot = Record<ProxyEnvKey, string | undefined>;

let baseProxyEnvSnapshot: ProxyEnvSnapshot | null = null;
let proxylineHandle: { stop: () => void; registerBypass: (params: { url: string }) => (() => void) | undefined } | null = null;

export function resetProxyLifecycleForTests(): void {
  baseProxyEnvSnapshot = null;
  proxylineHandle?.stop();
  proxylineHandle = null;
}

function captureProxyEnv(): ProxyEnvSnapshot {
  return {
    http_proxy: process.env["http_proxy"],
    https_proxy: process.env["https_proxy"],
    HTTP_PROXY: process.env["HTTP_PROXY"],
    HTTPS_PROXY: process.env["HTTPS_PROXY"],
    no_proxy: process.env["no_proxy"],
    NO_PROXY: process.env["NO_PROXY"],
    OPENCLAW_PROXY_ACTIVE: process.env["OPENCLAW_PROXY_ACTIVE"],
    OPENCLAW_PROXY_LOOPBACK_MODE: process.env["OPENCLAW_PROXY_LOOPBACK_MODE"],
    OPENCLAW_PROXY_CA_FILE: process.env["OPENCLAW_PROXY_CA_FILE"],
  };
}

function applyProxyEnv(proxyUrl: string, loopbackMode: ProxyLoopbackMode, proxyCaFile: string | undefined): void {
  for (const key of PROXY_ENV_KEYS) { process.env[key] = proxyUrl; }
  process.env["OPENCLAW_PROXY_ACTIVE"] = "1";
  process.env["OPENCLAW_PROXY_LOOPBACK_MODE"] = loopbackMode;
  if (proxyCaFile) { process.env["OPENCLAW_PROXY_CA_FILE"] = proxyCaFile; }
  else { delete process.env["OPENCLAW_PROXY_CA_FILE"]; }
  for (const key of NO_PROXY_ENV_KEYS) { process.env[key] = ""; }
}

function injectProxyEnv(proxyUrl: string, loopbackMode: ProxyLoopbackMode, proxyCaFile: string | undefined): ProxyEnvSnapshot {
  const snapshot = captureProxyEnv();
  applyProxyEnv(proxyUrl, loopbackMode, proxyCaFile);
  return snapshot;
}

function restoreProxyEnv(snapshot: ProxyEnvSnapshot): void {
  for (const key of ALL_PROXY_ENV_KEYS) {
    const value = snapshot[key];
    if (value === undefined) { delete process.env[key]; } else { process.env[key] = value; }
  }
}

function isSupportedProxyUrl(value: string): boolean {
  try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:"; }
  catch { return false; }
}

function resolveProxyUrl(config: ProxyConfig | undefined): string {
  const candidate = config?.proxyUrl?.trim() || process.env["OPENCLAW_PROXY_URL"]?.trim();
  if (!candidate) {
    throw new Error("proxy: enabled but no HTTP proxy URL is configured; set proxy.proxyUrl or OPENCLAW_PROXY_URL.");
  }
  if (!isSupportedProxyUrl(candidate)) {
    throw new Error("proxy: enabled but proxy URL is invalid; set proxy.proxyUrl or OPENCLAW_PROXY_URL to an http:// or https:// forward proxy.");
  }
  return candidate;
}

function redactProxyUrlForLog(value: string): string {
  try { return new URL(value).origin; } catch { return "<invalid proxy URL>"; }
}

function stopActiveProxyRegistration(registration: ActiveManagedProxyRegistration): void {
  if (registration.stopped) return;
  stopActiveManagedProxyRegistration(registration);
  if (getActiveManagedProxyUrl()) return;
  const restoreSnapshot = baseProxyEnvSnapshot ?? captureProxyEnv();
  baseProxyEnvSnapshot = null;
  restoreInactiveProxyRuntime(restoreSnapshot);
}

function restoreInactiveProxyRuntime(snapshot: ProxyEnvSnapshot): void {
  proxylineHandle?.stop();
  proxylineHandle = null;
  restoreProxyEnv(snapshot);
  ensureInheritedManagedProxyRoutingActive();
}

function isLoopbackIpAddress(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return normalized === "127.0.0.1" || normalized === "::1" || normalized === "0:0:0:0:0:0:0:1";
}

export function ensureInheritedManagedProxyRoutingActive(): void {
  if (process.env["OPENCLAW_PROXY_ACTIVE"] !== "1") return;
  const proxyUrl = process.env["HTTP_PROXY"];
  if (!proxyUrl || !isSupportedProxyUrl(proxyUrl)) return;
  // In a full implementation, this would install Proxyline routing
}

export async function startProxy(config: ProxyConfig | undefined): Promise<ProxyHandle | null> {
  if (config?.enabled !== true) return null;
  const proxyUrl = resolveProxyUrl(config);
  const loopbackMode = config.loopbackMode ?? "gateway-only";
  const proxyCaFile = (config as Record<string, unknown>)?.caFile as string | undefined;
  const activeUrl = getActiveManagedProxyUrl();

  if (activeUrl) {
    const registration = registerActiveManagedProxyUrl(new URL(proxyUrl), { loopbackMode });
    return {
      proxyUrl,
      stop: async () => { stopActiveProxyRegistration(registration); },
      kill: () => { stopActiveProxyRegistration(registration); },
    };
  }

  baseProxyEnvSnapshot ??= captureProxyEnv();
  const lifecycleBaseEnvSnapshot = baseProxyEnvSnapshot;
  let registration: ActiveManagedProxyRegistration | null = null;

  try {
    injectProxyEnv(proxyUrl, loopbackMode, proxyCaFile);
    registration = registerActiveManagedProxyUrl(new URL(proxyUrl), { loopbackMode });
  } catch (err) {
    if (registration) stopActiveManagedProxyRegistration(registration);
    restoreInactiveProxyRuntime(lifecycleBaseEnvSnapshot);
    baseProxyEnvSnapshot = null;
    throw new Error(`proxy: failed to activate external proxy routing: ${String(err)}`, { cause: err });
  }

  return {
    proxyUrl,
    stop: async () => { if (registration) stopActiveProxyRegistration(registration); },
    kill: () => { if (registration) stopActiveProxyRegistration(registration); },
  };
}

export async function stopProxy(handle: ProxyHandle | null): Promise<void> {
  if (!handle) return;
  await handle.stop();
}

function getGatewayControlPlaneBypassAuthority(value: string): string | null {
  try {
    const url = new URL(value);
    const validProtocols = ["ws:", "wss:", "http:", "https:"];
    if (!validProtocols.includes(url.protocol)) return null;
    const hostname = url.hostname.trim().toLowerCase();
    if (hostname !== "localhost" && !isLoopbackIpAddress(hostname)) return null;
    return url.port ? `${hostname}:${url.port}` : hostname;
  } catch { return null; }
}

export function registerManagedProxyGatewayLoopbackBypass(url: string): (() => void) | undefined {
  const authority = getGatewayControlPlaneBypassAuthority(url);
  if (!authority) return undefined;
  const loopbackMode = getActiveManagedProxyLoopbackMode();
  if (loopbackMode === "block") {
    throw new Error("proxy: Gateway loopback control-plane connections are blocked by proxy.loopbackMode");
  }
  if (loopbackMode === "proxy") return undefined;
  return proxylineHandle?.registerBypass({ url });
}

export function registerManagedProxyBrowserCdpBypass(url: string): (() => void) | undefined {
  const authority = getGatewayControlPlaneBypassAuthority(url);
  if (!authority) return undefined;
  const loopbackMode = getActiveManagedProxyLoopbackMode();
  if (loopbackMode === "block") {
    throw new Error("proxy: Browser loopback CDP connections are blocked by proxy.loopbackMode");
  }
  if (loopbackMode === "proxy") return undefined;
  return proxylineHandle?.registerBypass({ url });
}

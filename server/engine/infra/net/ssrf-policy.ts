// SSRF policy helpers enforce network target safety for plugin HTTP requests.
// Ported from openclaw/src/plugin-sdk/ssrf-policy.ts.
// Self-contained: depends only on cross-wms's infra/ssrf.ts and infra/net/hostname.ts.
import { lookup as dnsLookup } from "node:dns/promises";
import {
  isBlockedHostnameOrIp,
  isPrivateIpAddress,
  resolvePinnedHostname,
  SsrFBlockedError,
  type SsrFPolicy,
} from "../ssrf.js";
import { normalizeHostname } from "./hostname.js";

export { isPrivateIpAddress, isBlockedHostnameOrIp, SsrFBlockedError };
export type { SsrFPolicy };

/** DNS lookup function signature used by SSRF policy helpers. */
export type LookupFn = typeof dnsLookup;

// ---------------------------------------------------------------------------
// Inlined normalization helpers (replace @openclaw/normalization-core deps).
// ---------------------------------------------------------------------------

/** Coerces an unknown value into a nullable record for safe property access. */
function asNullableRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

/** Normalizes a value into a lowercase string, returning "" for non-strings. */
function normalizeLowercaseStringOrEmpty(value: unknown): string {
  if (typeof value === "string") {
    return value.trim().toLowerCase();
  }
  return "";
}

/** Deduplicates and trims a list of string entries, dropping empties. */
function normalizeUniqueStringEntries(values: readonly unknown[] | undefined): string[] {
  if (!values || values.length === 0) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Policy merging.
// ---------------------------------------------------------------------------

/** Merges multiple SSRF policies into one; later policies augment earlier ones. */
export function mergeSsrFPolicies(
  ...policies: Array<SsrFPolicy | undefined>
): SsrFPolicy | undefined {
  const merged: SsrFPolicy = {};
  for (const policy of policies) {
    if (!policy) {
      continue;
    }
    if (policy.allowPrivateNetwork) {
      merged.allowPrivateNetwork = true;
    }
    if (policy.dangerouslyAllowPrivateNetwork) {
      merged.dangerouslyAllowPrivateNetwork = true;
    }
    if (policy.allowedHostnames?.length) {
      merged.allowedHostnames = Array.from(
        new Set([...(merged.allowedHostnames ?? []), ...policy.allowedHostnames]),
      );
    }
    if (policy.allowedOrigins?.length) {
      merged.allowedOrigins = Array.from(
        new Set([...(merged.allowedOrigins ?? []), ...policy.allowedOrigins]),
      );
    }
    if (policy.hostnameAllowlist?.length) {
      merged.hostnameAllowlist = Array.from(
        new Set([...(merged.hostnameAllowlist ?? []), ...policy.hostnameAllowlist]),
      );
    }
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

// ---------------------------------------------------------------------------
// Private-network opt-in helpers.
// ---------------------------------------------------------------------------

/** Accepted channel config shapes that opt into private-network HTTP targets. */
export type PrivateNetworkOptInInput =
  | boolean
  | null
  | undefined
  | Pick<SsrFPolicy, "allowPrivateNetwork" | "dangerouslyAllowPrivateNetwork">
  | {
      /** Canonical explicit opt-in for private/internal network targets. */
      dangerouslyAllowPrivateNetwork?: boolean | null;
      /** @deprecated Compatibility alias; prefer dangerouslyAllowPrivateNetwork. */
      allowPrivateNetwork?: boolean | null;
      /** Nested channel config shape used by current plugin network settings. */
      network?:
        | Pick<SsrFPolicy, "allowPrivateNetwork" | "dangerouslyAllowPrivateNetwork">
        | null
        | undefined;
    };

/** Reads current and legacy private-network opt-in shapes from channel config. */
export function isPrivateNetworkOptInEnabled(input: PrivateNetworkOptInInput): boolean {
  if (input === true) {
    return true;
  }
  const record = asNullableRecord(input);
  if (!record) {
    return false;
  }
  const network = asNullableRecord(record.network);
  return (
    record.allowPrivateNetwork === true ||
    record.dangerouslyAllowPrivateNetwork === true ||
    network?.allowPrivateNetwork === true ||
    network?.dangerouslyAllowPrivateNetwork === true
  );
}

/** Converts channel private-network opt-in config into the shared SSRF policy shape. */
export function ssrfPolicyFromPrivateNetworkOptIn(
  input: PrivateNetworkOptInInput,
): SsrFPolicy | undefined {
  return isPrivateNetworkOptInEnabled(input) ? { allowPrivateNetwork: true } : undefined;
}

/** Compatibility wrapper for callers that already use the canonical dangerous flag name. */
export function ssrfPolicyFromDangerouslyAllowPrivateNetwork(
  dangerouslyAllowPrivateNetwork: boolean | null | undefined,
): SsrFPolicy | undefined {
  return ssrfPolicyFromPrivateNetworkOptIn(dangerouslyAllowPrivateNetwork);
}

/** @deprecated Use `ssrfPolicyFromDangerouslyAllowPrivateNetwork`. */
export function ssrfPolicyFromAllowPrivateNetwork(
  allowPrivateNetwork: boolean | null | undefined,
): SsrFPolicy | undefined {
  return ssrfPolicyFromDangerouslyAllowPrivateNetwork(allowPrivateNetwork);
}

// ---------------------------------------------------------------------------
// Legacy config migration.
// ---------------------------------------------------------------------------

/** Detects the retired flat `allowPrivateNetwork` key before doctor migration. */
export function hasLegacyFlatAllowPrivateNetworkAlias(value: unknown): boolean {
  const entry = asNullableRecord(value);
  return Boolean(entry && Object.hasOwn(entry, "allowPrivateNetwork"));
}

/** Moves flat private-network config into `network.dangerouslyAllowPrivateNetwork`. */
export function migrateLegacyFlatAllowPrivateNetworkAlias(params: {
  entry: Record<string, unknown>;
  pathPrefix: string;
  changes: string[];
}): { entry: Record<string, unknown>; changed: boolean } {
  if (!hasLegacyFlatAllowPrivateNetworkAlias(params.entry)) {
    return { entry: params.entry, changed: false };
  }

  const legacyAllowPrivateNetwork = params.entry.allowPrivateNetwork;
  const currentNetworkRecord = asNullableRecord(params.entry.network);
  const currentNetwork = currentNetworkRecord ? { ...currentNetworkRecord } : {};
  const currentDangerousAllowPrivateNetwork = currentNetwork.dangerouslyAllowPrivateNetwork;

  let resolvedDangerousAllowPrivateNetwork: unknown = currentDangerousAllowPrivateNetwork;
  if (typeof currentDangerousAllowPrivateNetwork === "boolean") {
    // The canonical key wins when both shapes are present.
    resolvedDangerousAllowPrivateNetwork = currentDangerousAllowPrivateNetwork;
  } else if (typeof legacyAllowPrivateNetwork === "boolean") {
    resolvedDangerousAllowPrivateNetwork = legacyAllowPrivateNetwork;
  } else if (currentDangerousAllowPrivateNetwork === undefined) {
    resolvedDangerousAllowPrivateNetwork = legacyAllowPrivateNetwork;
  }

  delete currentNetwork.dangerouslyAllowPrivateNetwork;
  if (resolvedDangerousAllowPrivateNetwork !== undefined) {
    currentNetwork.dangerouslyAllowPrivateNetwork = resolvedDangerousAllowPrivateNetwork;
  }

  const nextEntry = { ...params.entry };
  delete nextEntry.allowPrivateNetwork;
  if (Object.keys(currentNetwork).length > 0) {
    nextEntry.network = currentNetwork;
  } else {
    delete nextEntry.network;
  }

  params.changes.push(
    `Moved ${params.pathPrefix}.allowPrivateNetwork → ${params.pathPrefix}.network.dangerouslyAllowPrivateNetwork (${String(resolvedDangerousAllowPrivateNetwork)}).`,
  );
  return { entry: nextEntry, changed: true };
}

// ---------------------------------------------------------------------------
// HTTP URL validation.
// ---------------------------------------------------------------------------

/** Allows cleartext HTTP only when the target is loopback/private or DNS-pins to private IPs. */
export async function assertHttpUrlTargetsPrivateNetwork(
  url: string,
  params: {
    dangerouslyAllowPrivateNetwork?: boolean | null;
    allowPrivateNetwork?: boolean | null;
    lookupFn?: LookupFn;
    errorMessage?: string;
  } = {},
): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:") {
    return;
  }

  const errorMessage =
    params.errorMessage ?? "HTTP URL must target a trusted private/internal host";
  const { hostname } = parsed;
  if (!hostname) {
    throw new Error(errorMessage);
  }

  // Literal loopback/private hosts can stay local without DNS.
  if (isBlockedHostnameOrIp(hostname)) {
    return;
  }

  const allowPrivateNetwork =
    typeof params.dangerouslyAllowPrivateNetwork === "boolean"
      ? params.dangerouslyAllowPrivateNetwork
      : params.allowPrivateNetwork;

  if (allowPrivateNetwork !== true) {
    throw new Error(errorMessage);
  }

  // Private-network opt-in is for trusted private/internal targets, not a
  // blanket exemption for cleartext public internet hosts.
  const addresses = await resolvePinnedHostname(hostname, params.lookupFn ?? dnsLookup);
  if (!addresses.every((address) => isPrivateIpAddress(address))) {
    throw new Error(errorMessage);
  }
}

// ---------------------------------------------------------------------------
// Hostname suffix allowlist helpers.
// ---------------------------------------------------------------------------

function normalizeHostnameSuffix(value: string): string {
  const trimmed = normalizeLowercaseStringOrEmpty(value);
  if (!trimmed) {
    return "";
  }
  if (trimmed === "*" || trimmed === "*.") {
    return "*";
  }
  const withoutWildcard = trimmed.replace(/^\*\.?/, "");
  const withoutLeadingDot = withoutWildcard.replace(/^\.+/, "");
  return withoutLeadingDot.replace(/\.+$/, "");
}

function isHostnameAllowedBySuffixAllowlist(
  hostname: string,
  allowlist: readonly string[],
): boolean {
  if (allowlist.includes("*")) {
    return true;
  }
  const normalized = normalizeLowercaseStringOrEmpty(hostname);
  return allowlist.some((entry) => normalized === entry || normalized.endsWith(`.${entry}`));
}

/** Normalize suffix-style host allowlists into lowercase canonical entries with wildcard collapse. */
export function normalizeHostnameSuffixAllowlist(
  input?: readonly string[],
  defaults?: readonly string[],
): string[] {
  const source = input && input.length > 0 ? input : defaults;
  if (!source || source.length === 0) {
    return [];
  }
  const normalized = normalizeUniqueStringEntries(source.map(normalizeHostnameSuffix));
  if (normalized.includes("*")) {
    // `*` is an explicit opt-out from hostname suffix restrictions.
    return ["*"];
  }
  return normalized;
}

/** Check whether a URL is HTTPS and its hostname matches the normalized suffix allowlist. */
export function isHttpsUrlAllowedByHostnameSuffixAllowlist(
  url: string,
  allowlist: readonly string[],
): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      return false;
    }
    return isHostnameAllowedBySuffixAllowlist(parsed.hostname, allowlist);
  } catch {
    return false;
  }
}

/**
 * Converts suffix-style host allowlists (for example "example.com") into SSRF
 * hostname allowlist patterns used by the shared fetch guard.
 *
 * Suffix semantics:
 * - "example.com" allows "example.com" and "*.example.com"
 * - "*" disables hostname allowlist restrictions
 */
export function buildHostnameAllowlistPolicyFromSuffixAllowlist(
  allowHosts?: readonly string[],
): SsrFPolicy | undefined {
  const normalizedAllowHosts = normalizeHostnameSuffixAllowlist(allowHosts);
  if (normalizedAllowHosts.length === 0) {
    return undefined;
  }
  const patterns = new Set<string>();
  for (const normalized of normalizedAllowHosts) {
    if (normalized === "*") {
      return undefined;
    }
    patterns.add(normalized);
    patterns.add(`*.${normalized}`);
  }

  if (patterns.size === 0) {
    return undefined;
  }
  return { hostnameAllowlist: Array.from(patterns) };
}

// ---------------------------------------------------------------------------
// isAllowed — synchronous URL allow check (required by cross-wms SSRF policy).
// ---------------------------------------------------------------------------

function isHostnameAllowedByPattern(hostname: string, pattern: string): boolean {
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(2);
    if (!suffix || hostname === suffix) {
      return false;
    }
    return hostname.endsWith(`.${suffix}`);
  }
  return hostname === pattern;
}

function matchesHostnameAllowlist(hostname: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) {
    return true;
  }
  return allowlist.some((pattern) => isHostnameAllowedByPattern(hostname, pattern));
}

/**
 * Synchronously checks whether a URL is allowed by the SSRF policy.
 *
 * This performs a fast literal check of the URL's hostname against:
 * 1. The hostname allowlist (if defined) — patterns like `example.com` or `*.example.com`.
 * 2. Private/internal/special-use IP ranges (unless `allowPrivateNetwork` is set):
 *    - IPv4: 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, 0.0.0.0/8, 100.64.0.0/10
 *    - IPv6: ::1, fc00::/7, fe80::/10
 * 3. Blocked hostnames (localhost, *.local, *.internal, metadata.google.internal).
 *
 * This does NOT perform DNS resolution. For full DNS-rebinding protection,
 * use `assertSafeUrl` from `./ssrf-protect.js` which resolves and validates
 * DNS answers before the request is dispatched.
 */
export function isAllowed(url: string, policy?: SsrFPolicy): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (!hostname) {
    return false;
  }

  // Hostname allowlist check (when defined, the hostname must match).
  const allowlist = policy?.hostnameAllowlist ?? [];
  if (allowlist.length > 0 && !matchesHostnameAllowlist(hostname, allowlist)) {
    return false;
  }

  // Exact trusted-host exemption: allowedHostnames bypass private-IP checks.
  if (policy?.allowedHostnames?.includes(hostname)) {
    return true;
  }

  // Private-network exemption: when opted in, private IPs are allowed.
  if (policy?.dangerouslyAllowPrivateNetwork || policy?.allowPrivateNetwork) {
    return true;
  }

  // Fail closed for blocked hostnames and private/special-use IP literals.
  return !isBlockedHostnameOrIp(hostname, policy);
}

// ---------------------------------------------------------------------------
// Convenience guard.
// ---------------------------------------------------------------------------

/** Creates a synchronous SSRF guard bound to a fixed policy. */
export function createSsrfPolicyGuard(policy?: SsrFPolicy): {
  isAllowed: (url: string) => boolean;
} {
  return {
    isAllowed: (url: string) => isAllowed(url, policy),
  };
}

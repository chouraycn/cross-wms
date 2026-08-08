import { lookup as dnsLookup } from "node:dns/promises";
import { asNullableRecord } from "@openclaw/normalization-core/record-coerce";
import { normalizeLowercaseStringOrEmpty } from "@openclaw/normalization-core/string-coerce";
import { normalizeUniqueStringEntries } from "@openclaw/normalization-core/string-normalization";
import {
  isBlockedHostnameOrIp,
  isPrivateIpAddress,
  resolvePinnedHostname,
  type SsrFPolicy,
} from "../infra/ssrf";

export { isPrivateIpAddress };
export type { SsrFPolicy };

export type LookupFn = typeof dnsLookup;

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

type PinnedHostname = {
  hostname: string;
  addresses: string[];
};

async function resolvePinnedHostnameWithPolicy(
  hostname: string,
  params: { lookupFn?: LookupFn; policy?: SsrFPolicy } = {},
): Promise<PinnedHostname> {
  const lookupFn = params.lookupFn ?? dnsLookup;
  const addresses = await resolvePinnedHostname(hostname, lookupFn);
  return { hostname, addresses };
}

export type PrivateNetworkOptInInput =
  | boolean
  | null
  | undefined
  | Pick<SsrFPolicy, "allowPrivateNetwork" | "dangerouslyAllowPrivateNetwork">
  | {
      dangerouslyAllowPrivateNetwork?: boolean | null;
      allowPrivateNetwork?: boolean | null;
      network?:
        | Pick<SsrFPolicy, "allowPrivateNetwork" | "dangerouslyAllowPrivateNetwork">
        | null
        | undefined;
    };

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

export function ssrfPolicyFromPrivateNetworkOptIn(
  input: PrivateNetworkOptInInput,
): SsrFPolicy | undefined {
  return isPrivateNetworkOptInEnabled(input) ? { allowPrivateNetwork: true } : undefined;
}

export function ssrfPolicyFromDangerouslyAllowPrivateNetwork(
  dangerouslyAllowPrivateNetwork: boolean | null | undefined,
): SsrFPolicy | undefined {
  return ssrfPolicyFromPrivateNetworkOptIn(dangerouslyAllowPrivateNetwork);
}

export function hasLegacyFlatAllowPrivateNetworkAlias(value: any): boolean {
  const entry = asNullableRecord(value);
  return Boolean(entry && Object.hasOwn(entry, "allowPrivateNetwork"));
}

export function migrateLegacyFlatAllowPrivateNetworkAlias(params: {
  entry: Record<string, any>;
  pathPrefix: string;
  changes: string[];
}): { entry: Record<string, any>; changed: boolean } {
  if (!hasLegacyFlatAllowPrivateNetworkAlias(params.entry)) {
    return { entry: params.entry, changed: false };
  }

  const legacyAllowPrivateNetwork = params.entry.allowPrivateNetwork;
  const currentNetworkRecord = asNullableRecord(params.entry.network);
  const currentNetwork = currentNetworkRecord ? { ...currentNetworkRecord } : {};
  const currentDangerousAllowPrivateNetwork = currentNetwork.dangerouslyAllowPrivateNetwork;

  let resolvedDangerousAllowPrivateNetwork: any = currentDangerousAllowPrivateNetwork;
  if (typeof currentDangerousAllowPrivateNetwork === "boolean") {
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

export function ssrfPolicyFromAllowPrivateNetwork(
  allowPrivateNetwork: boolean | null | undefined,
): SsrFPolicy | undefined {
  return ssrfPolicyFromDangerouslyAllowPrivateNetwork(allowPrivateNetwork);
}

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

  const pinned = await resolvePinnedHostnameWithPolicy(hostname, {
    lookupFn: params.lookupFn,
    policy: ssrfPolicyFromDangerouslyAllowPrivateNetwork(true),
  });
  if (!pinned.addresses.every((address: string) => isPrivateIpAddress(address))) {
    throw new Error(errorMessage);
  }
}

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
    return ["*"];
  }
  return normalized;
}

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

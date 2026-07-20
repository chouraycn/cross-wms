// 移植自 openclaw/src/infra/net/configured-local-origin-bypass.ts
// 降级：循环检测和 SSRF 阻断依赖简化实现

export type ConfiguredLocalOriginManagedProxyBypass = {
  kind: "configured-local-origin";
  baseUrl: string;
};

function resolveHttpOrigin(value: string): string | undefined {
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }
    parsed.hostname = parsed.hostname.replace(/\.+$/, "");
    return parsed.origin.toLowerCase();
  } catch {
    return undefined;
  }
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname
    .trim()
    .toLowerCase()
    .replace(/\.+$/, "")
    .replace(/^\[(.*)\]$/, "$1");
  if (normalized === "localhost") return true;
  return normalized === "127.0.0.1" || normalized === "::1" || normalized === "0.0.0.0";
}

/** Return whether a configured local provider origin may bypass the managed proxy. */
export function shouldUseConfiguredLocalOriginManagedProxyBypass(params: {
  url: URL;
  managedProxyBypass: ConfiguredLocalOriginManagedProxyBypass | undefined;
  resolvedAddresses: readonly string[];
}): boolean {
  if (params.managedProxyBypass?.kind !== "configured-local-origin") {
    return false;
  }
  const baseOrigin = resolveHttpOrigin(params.managedProxyBypass.baseUrl);
  if (!baseOrigin) return false;
  let baseHostname: string;
  try {
    baseHostname = new URL(params.managedProxyBypass.baseUrl.trim()).hostname;
  } catch {
    return false;
  }
  if (!isLoopbackHost(baseHostname)) return false;
  if (resolveHttpOrigin(params.url.toString()) !== baseOrigin) return false;
  // Simplified: check all resolved addresses are loopback
  return (
    params.resolvedAddresses.length > 0 &&
    params.resolvedAddresses.every((addr) => isLoopbackHost(addr))
  );
}

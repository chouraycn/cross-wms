// Extension shared helpers - stub implementation for cross-wms.
// The original openclaw implementation depends on @openclaw/proxyline and
// internal infra modules not available in cross-wms. This stub provides the
// same export surface with no-op behavior so bundled extensions compile.

export async function resolveAmbientNodeProxyAgent<TAgent>(_params?: {
  onError?: (error: unknown) => void;
  onUsingProxy?: () => void;
  protocol?: "http" | "https";
}): Promise<TAgent | undefined> {
  return undefined;
}

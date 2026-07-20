/**
 * Web-search provider credential resolver.
 * Ported from openclaw/src/agents/tools/web-search-provider-credentials.ts
 *
 * Reads config values, env-backed secret refs, and provider-specific environment variables.
 */

/**
 * Resolves web-search provider credentials from config values, secret refs, or
 * provider-specific environment variables.
 */
export function resolveWebSearchProviderCredential(params: {
  credentialValue: unknown;
  path: string;
  envVars: string[];
}): string | undefined {
  // Try direct credential value first.
  const fromConfigRaw = typeof params.credentialValue === "string" ? params.credentialValue.trim() : "";
  if (fromConfigRaw && !fromConfigRaw.startsWith("secret://") && !fromConfigRaw.startsWith("env:")) {
    return fromConfigRaw;
  }

  // Check for env-backed secret ref pattern (e.g. "env:MY_API_KEY").
  if (fromConfigRaw.startsWith("env:")) {
    const envVarName = fromConfigRaw.slice(4).trim();
    const fromEnvRef = envVarName ? process.env[envVarName]?.trim() : undefined;
    if (fromEnvRef) {
      return fromEnvRef;
    }
    return undefined;
  }

  // Check for secret:// ref pattern — not fully supported in cross-wms.
  if (fromConfigRaw.startsWith("secret://")) {
    // Cannot resolve secret refs without the openclaw secrets infrastructure.
    return undefined;
  }

  // Fallback to provider-specific environment variables.
  for (const envVar of params.envVars) {
    const fromEnv = process.env[envVar]?.trim();
    if (fromEnv) {
      return fromEnv;
    }
  }

  return undefined;
}

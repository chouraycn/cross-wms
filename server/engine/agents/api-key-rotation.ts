/**
 * 移植自 openclaw/src/agents/api-key-rotation.ts
 *
 * Provider API-key rotation wrapper.
 * In cross-wms the full key collection and retry infrastructure is not available,
 * so collectProviderApiKeysForExecution returns only the primary key and
 * executeWithApiKeyRotation delegates to the execute callback directly.
 */

/** Collect primary and discovered provider keys (returns primary only in cross-wms). */
export function collectProviderApiKeysForExecution(params: {
  provider: string;
  primaryApiKey?: string;
}): string[] {
  const key = params.primaryApiKey?.trim();
  return key ? [key] : [];
}

/** Execute a provider operation with key rotation (no rotation in cross-wms). */
export async function executeWithApiKeyRotation<T>(
  params: {
    provider: string;
    apiKeys: string[];
    execute: (apiKey: string) => Promise<T>;
  },
): Promise<T> {
  const keys = params.apiKeys.filter((k) => k.trim());
  if (keys.length === 0) {
    throw new Error(`No API keys configured for provider "${params.provider}".`);
  }
  return params.execute(keys[0]);
}

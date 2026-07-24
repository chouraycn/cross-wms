export type ManifestModelIdNormalizationProvider = {
  aliases?: Record<string, string>;
  stripPrefixes?: string[];
  prefixWhenBare?: string;
  prefixWhenBareAfterAliasStartsWith?: {
    modelPrefix: string;
    prefix: string;
  }[];
};

export type ManifestModelIdNormalizationRecord = {
  modelIdNormalization?: {
    providers?: Record<string, ManifestModelIdNormalizationProvider>;
  };
};

const normalizationRecords = new Map<string, string>();

export function setCurrentManifestModelIdNormalizationRecords(
  plugins: readonly ManifestModelIdNormalizationRecord[] | undefined
): void {
  normalizationRecords.clear();
  if (!plugins) {
    return;
  }
  for (const plugin of plugins) {
    for (const [provider, policy] of Object.entries(plugin.modelIdNormalization?.providers ?? {})) {
      normalizationRecords.set(provider.toLowerCase(), JSON.stringify(policy));
    }
  }
}

export function normalizeModelId(providerId: string, modelId: string): string {
  const key = `${providerId}:${modelId}`;
  return normalizationRecords.get(key) ?? modelId;
}

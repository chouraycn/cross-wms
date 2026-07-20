const normalizationRecords = new Map<string, string>();

export function setCurrentManifestModelIdNormalizationRecords(
  records: Iterable<[string, string]>
): void {
  normalizationRecords.clear();
  for (const [key, value] of records) {
    normalizationRecords.set(key, value);
  }
}

export function normalizeModelId(providerId: string, modelId: string): string {
  const key = `${providerId}:${modelId}`;
  return normalizationRecords.get(key) ?? modelId;
}

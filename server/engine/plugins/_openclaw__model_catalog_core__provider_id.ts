export function normalizeProviderId(providerId: unknown): string {
  if (providerId === null || providerId === undefined) return '';
  return String(providerId).trim().toLowerCase();
}

export function findNormalizedProviderValue<T>(
  entries: Record<string, T> | undefined,
  provider: string,
): T | undefined {
  if (!entries) {
    return undefined;
  }
  const providerKey = normalizeProviderId(provider);
  for (const [key, value] of Object.entries(entries)) {
    if (normalizeProviderId(key) === providerKey) {
      return value;
    }
  }
  return undefined;
}

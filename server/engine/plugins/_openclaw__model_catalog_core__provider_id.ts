export function normalizeProviderId(providerId: unknown): string {
  if (providerId === null || providerId === undefined) return '';
  return String(providerId).trim().toLowerCase();
}

export function findNormalizedProviderValue(
  providers: readonly string[],
  input: string,
): string | undefined {
  const normalizedInput = normalizeProviderId(input);
  return providers.find(p => normalizeProviderId(p) === normalizedInput);
}

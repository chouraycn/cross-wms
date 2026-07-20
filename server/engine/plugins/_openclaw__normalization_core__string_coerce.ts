export function normalizeOptionalLowercaseString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  return String(value).trim().toLowerCase();
}

export function normalizeOptionalString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const str = String(value).trim();
  return str.length === 0 ? undefined : str;
}

export function normalizeLowercaseStringOrEmpty(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim().toLowerCase();
}

export function normalizeStringifiedOptionalString(value: unknown): string | undefined {
  return normalizeOptionalString(value);
}

export function normalizeLowercaseStringOrEmpty(value: string | undefined): string {
  if (!value) return '';
  return value.trim().toLowerCase();
}

export function normalizeOptionalString(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeOptionalLowercaseString(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : undefined;
}